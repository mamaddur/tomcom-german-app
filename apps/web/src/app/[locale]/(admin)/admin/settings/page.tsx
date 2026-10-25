import { getTranslations } from 'next-intl/server';
import { ADMIN_ROLES, api, type FeatureFlag, type Setting } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { saveSetting, setFlag } from './actions';

type Kind = 'number' | 'boolean' | 'numbers' | 'maintenance' | 'text';
const kindOf = (s: Setting): Kind =>
  s.key === 'app.maintenance'
    ? 'maintenance'
    : Array.isArray(s.default)
      ? 'numbers'
      : typeof s.default === 'number'
        ? 'number'
        : typeof s.default === 'boolean'
          ? 'boolean'
          : 'text';

/** FR-1101 settings and FR-1103 module switches. Super admins change; TOMCOM admins read. */
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; key?: string }>;
}) {
  const { locale } = await params;
  const q = await searchParams;
  const { me, accessToken, allowed } = await requireStaff(locale, ADMIN_ROLES);
  const t = await getTranslations({ locale, namespace: 'admin' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  const canEdit = me.role === 'super_admin';
  const [settings, flags] = await Promise.all([
    api<Setting[]>('/v1/admin/settings', { accessToken }),
    api<FeatureFlag[]>('/v1/admin/feature-flags', { accessToken }),
  ]);

  return (
    <>
      <h1>{t('settings.title')}</h1>
      <p>{canEdit ? t('settings.intro') : t('settings.readOnly')}</p>
      {q.saved && (
        <p role="status" className="ok">
          {t('settings.saved', { key: q.saved })}
        </p>
      )}
      {q.error && (
        <p role="alert" className="error">
          {q.key}:{' '}
          {t.has(`errors.${q.error}`)
            ? t(`errors.${q.error}` as 'errors.error')
            : t('errors.error')}
        </p>
      )}

      <h2>{t('settings.modules')}</h2>
      <table className="data">
        <tbody>
          {flags.map((f) => (
            <tr key={f.key} id={f.key}>
              <td>
                <code>{f.key}</code>
                <br />
                <small>{f.description}</small>
              </td>
              <td>{f.enabled ? t('settings.on') : t('settings.off')}</td>
              <td>
                {canEdit && (
                  <form action={setFlag.bind(null, locale, f.key, !f.enabled)}>
                    <button type="submit">
                      {f.enabled ? t('settings.turnOff') : t('settings.turnOn')}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>{t('settings.values')}</h2>
      {settings.map((s) => {
        const kind = kindOf(s);
        const id = `v-${s.key}`;
        const m = s.value as { active: boolean; message: { te: string; en: string } };
        return (
          <section key={s.key} id={s.key} className="card-item">
            <h3>
              <code>{s.key}</code>
            </h3>
            <p>
              <small>{s.description}</small>
            </p>
            <form action={saveSetting.bind(null, locale, s.key, kind)}>
              <fieldset disabled={!canEdit}>
                <legend className="visually-hidden">{s.key}</legend>
                {kind === 'maintenance' ? (
                  <>
                    <label className="check">
                      <input type="checkbox" name="active" defaultChecked={m.active} />{' '}
                      {t('settings.maintenanceOn')}
                    </label>
                    <label htmlFor={`${id}-te`}>{t('settings.messageTe')}</label>
                    <textarea
                      id={`${id}-te`}
                      name="te"
                      lang="te"
                      rows={2}
                      maxLength={300}
                      defaultValue={m.message.te}
                    />
                    <label htmlFor={`${id}-en`}>{t('settings.messageEn')}</label>
                    <textarea
                      id={`${id}-en`}
                      name="en"
                      rows={2}
                      maxLength={300}
                      defaultValue={m.message.en}
                    />
                  </>
                ) : kind === 'boolean' ? (
                  <label className="check">
                    <input type="checkbox" name="value" defaultChecked={s.value as boolean} />{' '}
                    {t('settings.on')}
                  </label>
                ) : (
                  <>
                    <label htmlFor={id}>
                      {t('settings.value')} ({t('settings.default')}: {JSON.stringify(s.default)})
                    </label>
                    <input
                      id={id}
                      name="value"
                      type={kind === 'number' ? 'number' : 'text'}
                      step={kind === 'number' ? 'any' : undefined}
                      defaultValue={
                        kind === 'numbers' ? (s.value as number[]).join(', ') : String(s.value)
                      }
                    />
                  </>
                )}
                {canEdit && <button type="submit">{t('settings.save')}</button>}
              </fieldset>
            </form>
          </section>
        );
      })}
    </>
  );
}
