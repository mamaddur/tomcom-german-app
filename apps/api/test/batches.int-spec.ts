import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import { createStaff, registerLearner, resetState, staffLogin } from './helpers.js';

describe('batches and bulk upload (FR-901) with trainer scoping (FR-908)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let trainerA: { id: string; token: string };
  let trainerB: { id: string; token: string };
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(phone: string) {
    const redis = await app.get(RedisService).connected();
    const keys = await redis.keys('otp-cooldown:*');
    if (keys.length) await redis.del(...keys);
    return (await staffLogin(app, phone)).tokens.accessToken;
  }

  const createBatch = (code: string, trainerIds: string[]) =>
    http()
      .post('/v1/admin/batches')
      .set(as(admin))
      .send({
        code,
        name: `Synthetic ${code}`,
        districtCode: 'warangal',
        tradeCode: 'electrician',
        trainerIds,
      });

  const upload = (batchId: string, body: Buffer, filename: string, token = admin) =>
    http()
      .post(`/v1/admin/batches/${batchId}/import`)
      .set(as(token))
      .attach('file', body, filename);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
    await createStaff(app, 'tomcom_admin', '+915599800001');
    const a = await createStaff(app, 'trainer', '+915599800002');
    const b = await createStaff(app, 'trainer', '+915599800003');
    admin = await login('+915599800001');
    trainerA = { id: a.id, token: await login('+915599800002') };
    trainerB = { id: b.id, token: await login('+915599800003') };
  });

  it('admins create batches with trainers; codes are unique; trainers cannot create', async () => {
    const res = await createBatch('WGL-ELEC-01', [trainerA.id]).expect(201);
    expect(res.body).toMatchObject({
      code: 'WGL-ELEC-01',
      status: 'active',
      learnerCount: 0,
      trainers: [{ id: trainerA.id }],
    });
    await createBatch('WGL-ELEC-01', []).expect(409);
    await createBatch('BAD code', []).expect(400);
    await createBatch('NZB-01', [admin]).expect(400); // not a trainer id
    await http()
      .post('/v1/admin/batches')
      .set(as(trainerA.token))
      .send({ code: 'TR-01', name: 'x', trainerIds: [] })
      .expect(403);
    expect(
      await prisma.db.auditLog.count({ where: { action: 'batch_create', entityId: res.body.id } }),
    ).toBe(1);
  });

  it('a trainer sees only their own batches; another batch looks missing (FR-908)', async () => {
    const mine = (await createBatch('A-01', [trainerA.id]).expect(201)).body;
    const theirs = (await createBatch('B-01', [trainerB.id]).expect(201)).body;
    const list = (await http().get('/v1/admin/batches').set(as(trainerA.token)).expect(200)).body;
    expect(list.map((b: { code: string }) => b.code)).toEqual(['A-01']);
    await http().get(`/v1/admin/batches/${mine.id}/learners`).set(as(trainerA.token)).expect(200);
    await http().get(`/v1/admin/batches/${theirs.id}`).set(as(trainerA.token)).expect(404);
    await http().get(`/v1/admin/batches/${theirs.id}/learners`).set(as(trainerA.token)).expect(404);
    // Admins see both.
    expect((await http().get('/v1/admin/batches').set(as(admin)).expect(200)).body).toHaveLength(2);
  });

  it('CSV upload: existing learners move in, new numbers are invited, bad rows are reported by row only', async () => {
    const batch = (await createBatch('CSV-01', [trainerA.id]).expect(201)).body;
    const existing = await registerLearner(app, '+915599800101');
    const csv = [
      'Name,Phone',
      'Test-A,+91 55998 00101', // existing learner
      'Test-B,5599800102', // not registered yet
      'Test-C,05599800102', // same number again
      'Test-D,12345', // invalid
      'Test-E,+915599800001', // a staff number: never enrolled
    ].join('\n');
    const res = await upload(batch.id, Buffer.from(csv), 'learners.csv').expect(200);
    expect(res.body).toEqual({ enrolled: 1, invited: 1, unchanged: 2, invalidRows: [5] });
    expect(JSON.stringify(res.body)).not.toContain('12345');

    const learners = (
      await http().get(`/v1/admin/batches/${batch.id}/learners`).set(as(admin)).expect(200)
    ).body;
    expect(learners).toEqual([
      expect.objectContaining({ id: existing.user.id, source: 'bulk', phone: '+91 •••••• 0101' }),
    ]);
    const after = (await http().get(`/v1/admin/batches/${batch.id}`).set(as(admin)).expect(200))
      .body;
    expect(after).toMatchObject({ learnerCount: 1, pendingInvites: 1 });

    // Uploading the same file again changes nothing.
    const again = await upload(batch.id, Buffer.from(csv), 'learners.csv').expect(200);
    expect(again.body).toMatchObject({ enrolled: 0, unchanged: 3 });

    // The invited number joins the batch when it registers with its own consent.
    const invited = await registerLearner(app, '+915599800102');
    const me = (await http().get('/v1/me').set(as(invited.tokens.accessToken)).expect(200)).body;
    expect(me.batch).toMatchObject({ code: 'CSV-01' });
    expect(await prisma.db.batchInvite.count()).toBe(0);

    const audit = await prisma.db.auditLog.findFirst({
      where: { action: 'batch_import', entityId: batch.id },
      orderBy: { id: 'asc' },
    });
    expect(audit?.details).toEqual({ rows: 5, enrolled: 1, invited: 1, unchanged: 2, invalid: 1 });
  });

  it('Excel upload reads the phone column, including numbers Excel stored as numbers', async () => {
    const batch = (await createBatch('XLS-01', []).expect(201)).body;
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Learners');
    sheet.addRow(['First name', 'Mobile']);
    sheet.addRow(['Test-F', 5599800201]);
    sheet.addRow(['Test-G', '+915599800202']);
    const xlsx = Buffer.from(await book.xlsx.writeBuffer());
    const res = await upload(batch.id, xlsx, 'learners.xlsx').expect(200);
    expect(res.body).toEqual({ enrolled: 0, invited: 2, unchanged: 0, invalidRows: [] });
  });

  it('rejects other files, closed batches and trainers uploading', async () => {
    const batch = (await createBatch('REJ-01', [trainerA.id]).expect(201)).body;
    await upload(batch.id, Buffer.from('%PDF-1.7'), 'list.pdf').expect(415);
    await upload(batch.id, Buffer.from('5599800301'), 'l.csv', trainerA.token).expect(403);
    await http()
      .patch(`/v1/admin/batches/${batch.id}`)
      .set(as(admin))
      .send({ status: 'closed' })
      .expect(200);
    await upload(batch.id, Buffer.from('5599800301'), 'l.csv').expect(409);
  });

  it('admins change trainers; the old trainer loses access', async () => {
    const batch = (await createBatch('MOVE-01', [trainerA.id]).expect(201)).body;
    await http()
      .patch(`/v1/admin/batches/${batch.id}`)
      .set(as(admin))
      .send({ trainerIds: [trainerB.id] })
      .expect(200);
    await http().get(`/v1/admin/batches/${batch.id}`).set(as(trainerA.token)).expect(404);
    await http().get(`/v1/admin/batches/${batch.id}`).set(as(trainerB.token)).expect(200);
  });

  it('learners cannot use the admin API', async () => {
    const learner = await registerLearner(app, '+915599800401');
    await http().get('/v1/admin/batches').set(as(learner.tokens.accessToken)).expect(403);
  });
});
