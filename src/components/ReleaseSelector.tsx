import { useTranslation } from 'react-i18next';
import { useTaskStore } from '../stores/taskStore';

function ReleaseSelector() {
  const { t } = useTranslation();
  const { releases, selectedReleaseId, setSelectedReleaseId } = useTaskStore();

  return (
    <select
      className="h-7 min-w-[140px] bg-white border border-input px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      value={selectedReleaseId || ''}
      onChange={(e) => setSelectedReleaseId(e.target.value || null)}
    >
      <option value="">{t('release.all')}</option>
      {[...releases].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })).map((release) => (
        <option key={release.id} value={release.id}>
          {release.name}
        </option>
      ))}
    </select>
  );
}

export default ReleaseSelector;
