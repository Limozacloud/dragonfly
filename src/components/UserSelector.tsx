import { useTranslation } from 'react-i18next';
import { useTaskStore } from '../stores/taskStore';

function UserSelector() {
  const { t } = useTranslation();
  const { users, selectedUserId, setSelectedUserId } = useTaskStore();

  return (
    <select
      className="h-7 min-w-[140px] bg-white border border-input px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      value={selectedUserId || ''}
      onChange={(e) => setSelectedUserId(e.target.value || null)}
    >
      <option value="">{t('users.all')}</option>
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name}
        </option>
      ))}
    </select>
  );
}

export default UserSelector;
