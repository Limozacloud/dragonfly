import { useTranslation } from 'react-i18next';
import {
  IconDashboard,
  IconLayoutKanban,
  IconListCheck,
  IconTag,
  IconNote,
  IconBrush,
  IconSettings,
  IconBell,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconSwitchHorizontal,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { useLayoutStore } from '@/stores/layoutStore';
import { useProjectStore } from '@/stores/projectStore';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

import { Page } from '@/types/ui';

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  onSwitchProject: () => void;
}

function Sidebar({ currentPage, onPageChange, onSwitchProject }: SidebarProps) {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar } = useLayoutStore();
  const projects = useProjectStore((s) => s.projects);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const currentProject = projects.find((p) => p.id === currentProjectId) || null;
  const navItems = [
    { id: 'dashboard' as Page, icon: IconDashboard, label: t('sidebar.dashboard') },
    { id: 'todo' as Page, icon: IconListCheck, label: t('sidebar.todo') },
    { id: 'notes' as Page, icon: IconNote, label: t('sidebar.notes') },
    { id: 'scratchpad' as Page, icon: IconBrush, label: t('sidebar.scratchpad') },
    { id: 'reminders' as Page, icon: IconBell, label: t('sidebar.reminders') },
    { id: 'board' as Page, icon: IconLayoutKanban, label: t('sidebar.board') },
    { id: 'releases' as Page, icon: IconTag, label: t('sidebar.releases') },
    { id: 'settings' as Page, icon: IconSettings, label: t('sidebar.settings') },
  ];

  return (
    <aside
      className={cn(
        'h-full flex flex-col bg-gradient-to-b from-sidebar-bg to-sidebar-darker text-white shadow-[4px_0_15px_rgba(0,0,0,0.15)] transition-all duration-300 ease-in-out overflow-hidden',
        sidebarCollapsed ? 'w-[56px] min-w-[56px]' : 'w-[240px] min-w-[240px]',
      )}
    >
      <div className="px-4 pt-3 pb-2 border-b border-white/10 overflow-visible">
        {sidebarCollapsed ? (
          <img
            src="/images/dragonfly-sidebar.svg"
            alt="Dragonfly"
            className="w-10 h-10 mx-auto"
            style={{ borderRadius: 6 }}
          />
        ) : (
          <div className="relative flex items-center justify-center">
            <span
              className="text-2xl pb-2 bg-gradient-to-r from-[#00B4D8] to-[#0077B6] bg-clip-text text-transparent z-10"
              style={{ fontFamily: "'Pacifico', cursive", lineHeight: 1.6 }}
            >
              Dragonfly
            </span>
            <img
              src="/images/dragonfly-sidebar.svg"
              alt=""
              className="-ml-2 -mt-4 w-8 h-8 z-0"
              style={{ borderRadius: 4, transform: 'rotate(36deg)' }}
            />
          </div>
        )}
      </div>

      {/* Project indicator */}
      {currentProject && (
        <div className="px-3 py-2 border-b border-white/10">
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="flex items-center justify-center w-full py-1 bg-transparent border-0 cursor-pointer"
                  onClick={onSwitchProject}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: currentProject.color }}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {currentProject.name} — {t('project.switchProject')}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              className="flex items-center gap-2 w-full text-left px-1 py-1 bg-transparent border-0 text-white/60 hover:text-white/90 transition-colors cursor-pointer group"
              onClick={onSwitchProject}
              title={t('project.switchProject')}
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: currentProject.color }}
              />
              <span className="text-xs font-medium truncate flex-1">{currentProject.name}</span>
              <IconSwitchHorizontal size={14} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const button = (
              <button
                className={cn(
                  'flex items-center gap-3 w-full text-left px-4 py-3 text-[0.9rem] font-medium transition-all border-0 bg-transparent whitespace-nowrap',
                  sidebarCollapsed && 'justify-center px-0',
                  currentPage === item.id
                    ? 'bg-gradient-to-r from-primary to-primary-dark text-white shadow-[0_4px_12px_rgba(0,119,182,0.4)]'
                    : 'text-white/70 hover:bg-white/10 hover:text-white',
                )}
                onClick={() => onPageChange(item.id)}
              >
                <item.icon size={20} className="shrink-0" />
                {!sidebarCollapsed && item.label}
              </button>
            );

            return (
              <li key={item.id}>
                {sidebarCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  button
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {!sidebarCollapsed && (
        <div className="px-4 py-2 text-white/50 text-xs">
          {t('task.quickAdd')}
        </div>
      )}

      <div className="px-3 py-3 border-t border-white/10">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex items-center justify-center w-full py-2 text-white/50 hover:text-white/80 transition-colors bg-transparent border-0 cursor-pointer"
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? (
                <IconLayoutSidebarLeftExpand size={20} />
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <IconLayoutSidebarLeftCollapse size={20} />
                  <span>{t('layout.collapseSidebar')}</span>
                </div>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {sidebarCollapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')}
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

export default Sidebar;
