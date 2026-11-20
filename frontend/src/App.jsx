import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Link, useNavigate } from 'react-router-dom';
import {
  Truck,
  MapPin,
  BarChart3,
  BookOpen,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Layers,
  Route as RouteIcon,
  Volume2,
  VolumeX,
} from 'lucide-react';
import OverviewPage from './pages/OverviewPage';
import DispatchPage from './pages/DispatchPage';
import SchedulePage from './pages/SchedulePage';
import AnalyticsPage from './pages/AnalyticsPage';
import ConceptsModal from './components/ConceptsModal';
import { api } from './api/client';
import {
  isSoundMuted,
  setSoundMuted,
  subscribeMute,
  stopAllSounds,
} from './utils/soundEngine';

export default function App() {
  const [isConceptsOpen, setIsConceptsOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [muted, setMuted] = useState(isSoundMuted());
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeMute((newMuted) => {
      setMuted(newMuted);
    });
    return unsub;
  }, []);

  const handleToggleSound = () => {
    setSoundMuted(!muted);
  };

  const handleResetDemo = async () => {
    if (!window.confirm('Reset all nodes, road disruptions, and pickups back to default Delhi NCR scenario?')) {
      return;
    }
    stopAllSounds();
    setResetting(true);
    try {
      await api.resetDemo();
      alert('Demo data successfully reset to default Delhi NCR network!');
      window.location.reload();
    } catch (err) {
      alert(`Failed to reset demo: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-emerald-100 selection:text-emerald-900">
      {/* Persistent Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <Truck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-lg text-slate-950 tracking-tight">EcoRoute</span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium block -mt-0.5">
                E-Waste Route Optimisation Platform
              </span>
            </div>
          </Link>

          {/* 4 Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/70 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg transition-all ${
                  isActive
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`
              }
            >
              Overview
            </NavLink>

            <NavLink
              to="/dispatch"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`
              }
            >
              <RouteIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>Live Dispatch</span>
            </NavLink>

            <NavLink
              to="/schedule"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`
              }
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Schedule Pickup</span>
            </NavLink>

            <NavLink
              to="/analytics"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`
              }
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Centres & Analytics</span>
            </NavLink>
          </nav>

          {/* Right Utility Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsConceptsOpen(true)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
              title="Key Concepts & Should-Know Notes"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Key Concepts & Notes</span>
            </button>

            <button
              type="button"
              onClick={handleResetDemo}
              disabled={resetting}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-rose-600 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
              title="Reset Demo to Delhi NCR Default"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Reset Demo</span>
            </button>

            {/* Sound On / Muted Toggle Button */}
            <button
              type="button"
              onClick={handleToggleSound}
              className={`p-1.5 sm:px-3 sm:py-1.5 rounded-xl border transition-all flex items-center gap-1.5 shadow-2xs text-xs font-semibold ${
                muted
                  ? 'border-slate-200 bg-slate-100/90 text-slate-400 hover:text-slate-600'
                  : 'border-slate-200 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700'
              }`}
              title={muted ? 'Enable sound effects' : 'Mute sound effects'}
              aria-label={muted ? 'Enable sound effects' : 'Mute sound effects'}
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound On'}</span>
            </button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <div className="md:hidden flex items-center justify-around border-t border-slate-100 bg-slate-50 px-2 py-1.5 text-xs font-medium">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-2 py-1 rounded ${isActive ? 'text-emerald-700 font-bold' : 'text-slate-600'}`
            }
          >
            Overview
          </NavLink>
          <NavLink
            to="/dispatch"
            className={({ isActive }) =>
              `px-2 py-1 rounded ${isActive ? 'text-emerald-700 font-bold' : 'text-slate-600'}`
            }
          >
            Live Dispatch
          </NavLink>
          <NavLink
            to="/schedule"
            className={({ isActive }) =>
              `px-2 py-1 rounded ${isActive ? 'text-emerald-700 font-bold' : 'text-slate-600'}`
            }
          >
            Schedule
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `px-2 py-1 rounded ${isActive ? 'text-emerald-700 font-bold' : 'text-slate-600'}`
            }
          >
            Analytics
          </NavLink>
        </div>
      </header>

      {/* Main Pages Outlet */}
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/dispatch" element={<DispatchPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<OverviewPage />} />
        </Routes>
      </main>

      {/* Concepts Reference Modal */}
      <ConceptsModal isOpen={isConceptsOpen} onClose={() => setIsConceptsOpen(false)} />
    </div>
  );
}
