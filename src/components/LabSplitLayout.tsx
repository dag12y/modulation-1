import React from 'react';

interface LabSplitLayoutProps {
  title: string;
  formula?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  rightSidebar: React.ReactNode;
}

export const LabSplitLayout: React.FC<LabSplitLayoutProps> = ({
  title,
  formula,
  headerRight,
  children,
  rightSidebar,
}) => {
  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 h-full">
      {/* Center Simulation Stage */}
      <section className="flex-1 min-w-0 p-3 md:p-4 lg:overflow-y-auto space-y-3">
        {/* Compact 1-line Header & Formula Strip */}
        <div className="bg-white border border-[#E8E3EF] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
            <h1 className="text-sm md:text-base font-bold text-[#24212C] whitespace-nowrap">
              {title}
            </h1>
            {formula && (
              <span className="text-xs font-mono text-[#7045B8] truncate">
                {formula}
              </span>
            )}
          </div>
          {headerRight && (
            <div className="flex items-center gap-2 shrink-0">{headerRight}</div>
          )}
        </div>

        {/* Simulation Canvases */}
        <div className="space-y-3">{children}</div>
      </section>

      {/* Right Parameter Controls Sidebar */}
      <aside className="w-full lg:w-72 xl:w-80 shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-[#E8E3EF] p-4 lg:overflow-y-auto space-y-4">
        {rightSidebar}
      </aside>
    </div>
  );
};
