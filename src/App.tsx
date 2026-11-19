import React, { useEffect, useState } from 'react';
import {
  LayoutGrid,
  BookOpen,
  Waves,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Activity,
  Radio,
  Sliders,
  GitCompare,
  Sun,
  Moon,
  Settings2,
} from 'lucide-react';

import { SimulationProvider, useSimulation } from './context/SimulationContext';
import { AudioLabProvider } from './context/AudioLabContext';
import { OverviewStudioView, StudioBenchTopic } from './views/studio/OverviewStudioView';
import { ExperimentBenchView } from './views/studio/ExperimentBenchView';
import { ComparisonStudioView } from './views/studio/ComparisonStudioView';
import { TheoryStudioView } from './views/studio/TheoryStudioView';

type StudioRoute = 'overview' | 'bench' | 'comparison' | 'theory';

const LAB_TOPICS: {
  id: StudioBenchTopic | 'comparison' | 'overview' | 'theory';
  num?: string;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'overview',
    label: 'Overview',
    sublabel: 'Studio launchpad',
    icon: LayoutGrid,
  },
  {
    id: 'conventional-am',
    num: '01',
    label: 'Conventional AM',
    sublabel: 'DSB-FC · Envelope detection',
    icon: Activity,
  },
  {
    id: 'dsb-sc',
    num: '02',
    label: 'DSB-SC',
    sublabel: 'Product modulation · Coherent detection',
    icon: Radio,
  },
  {
    id: 'ssb',
    num: '03',
    label: 'SSB',
    sublabel: 'USB / LSB · Filter and phase shift',
    icon: Waves,
  },
  {
    id: 'vsb',
    num: '04',
    label: 'VSB',
    sublabel: 'Shaping filter · Vestige',
    icon: Sliders,
  },
  {
    id: 'comparison',
    num: '05',
    label: 'AM Comparison',
    sublabel: 'Power, BW, Landscape',
    icon: GitCompare,
  },
  {
    id: 'theory',
    label: 'Equations & Notes',
    sublabel: 'AM theory formulas',
    icon: BookOpen,
  },
];

const TOPIC_DISPLAY: Record<StudioBenchTopic, string> = {
  'conventional-am': 'DSB-FC',
  'dsb-sc': 'DSB-SC',
  ssb: 'SSB-SC',
  vsb: 'VSB',
};

function AppContent() {
  const { isSimulating, toggleSimulation, simulationSpeed, setSimulationSpeed } = useSimulation();
  const [route, setRoute] = useState<StudioRoute>('overview');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [benchTopic, setBenchTopic] = useState<StudioBenchTopic>('conventional-am');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [resetKey, setResetKey] = useState<number>(0);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('modulab-dark-mode') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', darkMode);
    try {
      localStorage.setItem('modulab-dark-mode', String(darkMode));
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  const handleOpenBenchTopic = (topic: StudioBenchTopic) => {
    setBenchTopic(topic);
    setRoute('bench');
  };

  const handleNavClick = (id: StudioBenchTopic | 'comparison' | 'overview' | 'theory') => {
    if (id === 'overview') {
      setRoute('overview');
    } else if (id === 'comparison') {
      setRoute('comparison');
    } else if (id === 'theory') {
      setRoute('theory');
    } else {
      setBenchTopic(id);
      setRoute('bench');
    }
  };

  const handleReset = () => {
    setResetKey((k) => k + 1);
  };

  const activeNavId =
    route === 'overview'
      ? 'overview'
      : route === 'comparison'
      ? 'comparison'
      : route === 'theory'
      ? 'theory'
      : benchTopic;

  return (
    <div className="min-h-screen lg:h-screen bg-[#FCFCFA] text-[#111827] flex font-sans lg:overflow-hidden">
      {/* Unified Collapsible Left Sidebar */}
      <aside
        className={`shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between py-3 transition-all duration-200 z-40 ${
          sidebarCollapsed ? 'w-14 items-center px-1.5' : 'w-56 px-3'
        }`}
      >
        <div className="space-y-4 w-full">
          {/* Logo Header + Collapse Toggle */}
          <div
            className={`flex items-center ${
              sidebarCollapsed ? 'justify-center' : 'justify-between px-1'
            }`}
          >
            <button
              onClick={() => setRoute('overview')}
              className="flex items-center gap-2.5 cursor-pointer"
              title="AM Studio Overview"
            >
              <div className="w-9 h-9 rounded-xl bg-[#1E4620] flex items-center justify-center shadow-xs shrink-0 hover:bg-[#153316] transition-colors">
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="none"
                  stroke="#A3E635"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="2 12 6 12 9 5 13 19 16 10 18 12 22 12" />
                </svg>
              </div>
              {!sidebarCollapsed && (
                <div className="text-left min-w-0">
                  <div className="text-sm font-bold text-[#111827] leading-tight">ModuLab</div>
                  <div className="text-[10px] font-mono text-slate-400">AM STUDIO</div>
                </div>
              )}
            </button>

            {!sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-1.5 rounded-md text-slate-400 hover:text-[#1E4620] hover:bg-[#EFF3EB] transition-colors cursor-pointer"
                title="Collapse sidebar to icons"
                aria-label="Collapse sidebar to icons"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Primary navigation */}
          <nav className="space-y-1 w-full">
            {LAB_TOPICS.filter((item) => item.id === 'overview' || item.id === 'conventional-am' || item.id === 'comparison').map(
              (item) => {
                const Icon = item.icon;
                const isActive = item.id === 'conventional-am' ? route === 'bench' : activeNavId === item.id;
                const fullTitle = item.id === 'overview' ? 'Explore' : item.id === 'conventional-am' ? 'Experiments' : 'Compare';
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    title={sidebarCollapsed ? `${fullTitle} — ${item.sublabel}` : undefined}
                    className={`w-full flex items-center rounded-lg transition-colors cursor-pointer ${
                      sidebarCollapsed ? 'justify-center h-10 px-0' : 'gap-2.5 px-2.5 py-2 text-left'
                    } ${
                      isActive
                        ? 'bg-[#EFF3EB] text-[#1E4620]'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-[#111827]'
                    }`}
                  >
                    <Icon
                      className={`w-[18px] h-[18px] shrink-0 ${
                        isActive ? 'text-[#1E4620]' : 'text-slate-400'
                      }`}
                    />
                    {!sidebarCollapsed && (
                      <div className="min-w-0">
                        <div className={`text-xs truncate ${isActive ? 'font-bold' : 'font-medium'}`}>
                          {fullTitle}
                        </div>
                      </div>
                    )}
                  </button>
                );
              }
            )}
          </nav>
        </div>

        {/* Bottom Chapter Indicator / Expand Button */}
        <div className="pt-3 border-t border-slate-100 w-full flex flex-col items-center gap-2">
          {sidebarCollapsed ? (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#1E4620] hover:bg-[#EFF3EB] transition-colors cursor-pointer"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-full px-2 text-[10px] font-mono text-slate-400 truncate">
              AM &amp; DEMODULATION
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* Top Studio Breadcrumb & Speed Controls Bar */}
        <header className="h-12 shrink-0 bg-[#FCFCFA] border-b border-slate-200 px-4 md:px-6 flex items-center justify-between gap-4">
          {/* Left: Collapse/Expand Toggle + Breadcrumb */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="p-1.5 rounded-md text-slate-500 hover:text-[#1E4620] hover:bg-[#EFF3EB] transition-colors cursor-pointer"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar to icons'}
              aria-label="Toggle sidebar"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>

            <nav className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
              <button
                onClick={() => setRoute('overview')}
                className="hover:text-[#111827] cursor-pointer"
              >
                Laboratory
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              {route === 'overview' && (
                <span className="font-semibold text-[#111827]">Overview</span>
              )}
              {route === 'comparison' && (
                <span className="font-semibold text-[#111827]">Comparison</span>
              )}
              {route === 'theory' && (
                <span className="font-semibold text-[#111827]">Modulation Equations</span>
              )}
              {route === 'bench' && (
                <>
                  <button
                    onClick={() => setRoute('bench')}
                    className="hover:text-[#111827] cursor-pointer hidden sm:inline"
                  >
                    Experiments
                  </button>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 hidden sm:inline" />
                  <span className="font-semibold text-[#111827] truncate">
                    {TOPIC_DISPLAY[benchTopic]}
                  </span>
                </>
              )}
            </nav>
          </div>

          {/* Right: Speed Selector (0.2x, 0.5x, 1x, 2x) + Pause/Play + Reset */}
          <div className="flex items-center gap-2 shrink-0">
            {settingsOpen && <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-200 text-[11px] font-mono">
              {[0.2, 0.5, 1, 2].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setSimulationSpeed(spd)}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    simulationSpeed === spd
                      ? 'bg-[#1E4620] text-white font-semibold'
                      : 'text-slate-500 hover:text-[#111827]'
                  }`}
                  title={`Simulation speed ${spd}x`}
                >
                  {spd}x
                </button>
              ))}
            </div>}

            <button
              onClick={toggleSimulation}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isSimulating
                  ? 'bg-[#EFF3EB] hover:bg-[#DCE5D5] text-[#1E4620] border border-[#DCE5D5]'
                  : 'bg-[#1E4620] hover:bg-[#153316] text-white'
              }`}
            >
              {isSimulating ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-[#111827] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Reset simulation parameters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>

            <button onClick={() => setSettingsOpen((v) => !v)} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600" aria-label="Settings" title="Settings"><Settings2 className="w-4 h-4" /></button>
            {settingsOpen && <button
              onClick={() => setDarkMode((d) => !d)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-[#111827] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden md:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Dark</span>
                </>
              )}
            </button>}
          </div>
        </header>

        {/* Active Studio View */}
        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          {route === 'overview' && (
            <OverviewStudioView
              onOpenExperiment={handleOpenBenchTopic}
              onOpenComparison={() => setRoute('comparison')}
              onOpenTheory={() => setRoute('theory')}
            />
          )}

          {route === 'bench' && (
            <ExperimentBenchView
              activeTopic={benchTopic}
              onSelectTopic={setBenchTopic}
              resetKey={resetKey}
            />
          )}

          {route === 'comparison' && (
            <ComparisonStudioView onOpenExperiment={handleOpenBenchTopic} />
          )}

          {route === 'theory' && <TheoryStudioView onOpenExperiment={handleOpenBenchTopic} />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <SimulationProvider>
      <AudioLabProvider>
        <AppContent />
      </AudioLabProvider>
    </SimulationProvider>
  );
}
