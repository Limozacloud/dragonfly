import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { useTaskStore } from '../../stores/taskStore';
import { User } from '../../types';
import { AVATAR_COLORS } from '@/lib/constants';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { AppModal } from '../ui/app-modal';
import { UserAvatar } from '../ui/user-avatar';

export default function SettingsUsers() {
  const { t } = useTranslation();
  const { users, tasks, addUser, updateUser, deleteUser } = useTaskStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [deleteUserTarget, setDeleteUserTarget] = useState<User | null>(null);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setName(user.name);
      setColor(user.color);
    } else {
      setEditingUser(null);
      setName('');
      setColor(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setName('');
    setColor(AVATAR_COLORS[0]);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (editingUser) {
      await updateUser(editingUser.id, { name: name.trim(), color });
    } else {
      await addUser({ name: name.trim(), color });
    }
    handleCloseModal();
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;
    await deleteUser(deleteUserTarget.id);
    setDeleteUserTarget(null);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('users.title')}</CardTitle>
          <Button size="sm" onClick={() => handleOpenModal()}>
            <IconPlus size={16} className="mr-1" />
            {t('users.create')}
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          {users.length === 0 ? (
            <p className="text-muted-foreground text-center">{t('users.noUsers')}</p>
          ) : (
            <div className="divide-y divide-border">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <UserAvatar name={user.name} color={user.color} size="sm" />
                    <span>{user.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => handleOpenModal(user)}>
                      <IconEdit size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteUserTarget(user)}
                    >
                      <IconTrash size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete User Confirmation */}
      <AppModal
        isOpen={!!deleteUserTarget}
        onClose={() => setDeleteUserTarget(null)}
        title={t('users.delete')}
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteUserTarget(null)}>
              {t('task.cancel')}
            </Button>
            {deleteUserTarget && tasks.filter((t) => t.assigneeId === deleteUserTarget.id).length === 0 && (
              <Button variant="destructive" size="sm" onClick={handleDeleteUser}>
                {t('task.delete')}
              </Button>
            )}
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {deleteUserTarget && tasks.filter((tk) => tk.assigneeId === deleteUserTarget.id).length > 0
            ? t('users.hasTasksDependency', { count: tasks.filter((tk) => tk.assigneeId === deleteUserTarget.id).length })
            : t('common.confirmDelete')
          }
        </p>
      </AppModal>

      {/* User Create/Edit Modal */}
      <AppModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingUser ? t('users.edit') : t('users.create')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              {t('users.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              {t('users.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">{t('users.name')}</Label>
            <Input
              placeholder={t('users.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <Label className="mb-2 block">{t('users.color')}</Label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="w-8 h-8 rounded-full transition-all"
                  style={{
                    backgroundColor: c,
                    border: color === c ? '2px solid #6366f1' : '2px solid transparent',
                    boxShadow: color === c ? '0 0 0 2px white, 0 0 0 4px #6366f1' : 'none',
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-2 p-3 bg-muted">
            <UserAvatar name={name || '?'} color={color} />
            <span className="font-medium">{name || t('users.namePlaceholder')}</span>
          </div>
        </div>
      </AppModal>
    </>
  );
}
