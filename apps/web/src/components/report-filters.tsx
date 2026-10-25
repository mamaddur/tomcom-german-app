import { getTranslations } from 'next-intl/server';
import type { Batch, ReferenceItem, Trainer } from '@/lib/api';

/** FR-903: one GET form for every report, so dashboard, list and export share the filters. */
export async function ReportFilters({
  locale,
  action,
  values,
  batches,
  districts,
  trades,
  trainers,
}: {
  locale: string;
  action: string;
  values: Record<string, string | undefined>;
  batches: Batch[];
  districts: ReferenceItem[];
  trades: ReferenceItem[];
  trainers: Trainer[];
}) {
  const t = await getTranslations({ locale, namespace: 'admin' });
  const name = (i: ReferenceItem) => i.name[locale] ?? i.name.en ?? i.code;
  return (
    <form method="get" action={action} className="filters" aria-label={t('filters.title')}>
      <label>
        {t('batches.title')}
        <select name="batchId" defaultValue={values.batchId ?? ''}>
          <option value="">{t('filters.all')}</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('batches.district')}
        <select name="districtCode" defaultValue={values.districtCode ?? ''}>
          <option value="">{t('filters.all')}</option>
          {districts.map((d) => (
            <option key={d.code} value={d.code}>
              {name(d)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('batches.trade')}
        <select name="tradeCode" defaultValue={values.tradeCode ?? ''}>
          <option value="">{t('filters.all')}</option>
          {trades.map((d) => (
            <option key={d.code} value={d.code}>
              {name(d)}
            </option>
          ))}
        </select>
      </label>
      {trainers.length > 0 && (
        <label>
          {t('filters.trainer')}
          <select name="trainerId" defaultValue={values.trainerId ?? ''}>
            <option value="">{t('filters.all')}</option>
            {trainers.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t('filters.level')}
        <select name="level" defaultValue={values.level ?? ''}>
          <option value="">{t('filters.all')}</option>
          {['A1', 'A2', 'B1'].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('filters.from')}
        <input type="date" name="from" defaultValue={values.from ?? ''} />
      </label>
      <label>
        {t('filters.to')}
        <input type="date" name="to" defaultValue={values.to ?? ''} />
      </label>
      <button type="submit">{t('filters.apply')}</button>
    </form>
  );
}
