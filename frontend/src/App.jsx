import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, NavLink, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Layers,
  Route as RouteIcon,
  Volume2,
  VolumeX,
  Menu,
} from 'lucide-react';
import OverviewPage from './pages/OverviewPage';
import DispatchPage from './pages/DispatchPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ConceptsModal from './components/ConceptsModal';
import { api } from './api/client';
import {
  isSoundMuted,
  setSoundMuted,
  subscribeMute,
  stopAllSounds,
} from './utils/soundEngine';

export function EcoRouteLeafLogo({ className = 'w-6 h-6', alt = 'EcoRoute' }) {
  return (
    <img
      src="/logo-icon.png"
      alt={alt}
      className={`${className} object-contain shrink-0 select-none`}
      draggable={false}
    />
  );
}

export default function App() {
  const [isConceptsOpen, setIsConceptsOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [muted, setMuted] = useState(isSoundMuted());
  const [isOverviewMenuOpen, setIsOverviewMenuOpen] = useState(false);
  const overviewMenuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isOverview = location.pathname === '/';

  useEffect(() => {
    const unsub = subscribeMute((newMuted) => {
      setMuted(newMuted);
    });
    return unsub;
  }, []);

  // Close overview dropdown on outside click or escape
  useEffect(() => {
    function handleClickOutside(event) {
      if (overviewMenuRef.current && !overviewMenuRef.current.contains(event.target)) {
        setIsOverviewMenuOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOverviewMenuOpen(false);
      }
    }
    if (isOverviewMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOverviewMenuOpen]);

  // Close menu on route change
  useEffect(() => {
    setIsOverviewMenuOpen(false);
  }, [location.pathname]);

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
    <div
      className={
        isOverview
          ? 'min-h-screen lg:h-screen lg:overflow-hidden bg-[#061126] text-white flex flex-col relative selection:bg-white/20 selection:text-white'
          : 'min-h-screen bg-background flex flex-col selection:bg-emerald-100 selection:text-emerald-900'
      }
    >
      {/* Route-Scoped Navigation Bar */}
      {isOverview ? (
        /* Floating transparent white-text header ONLY on / (Overview) route */
        <header className="absolute top-0 left-0 right-0 z-40 w-full px-6 sm:px-12 lg:px-16 py-6 sm:py-8 pointer-events-auto">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            {/* Left: EcoRoute brand logo + EcoRoute text */}
            <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group">
              <EcoRouteLeafLogo className="w-7 h-7 sm:w-8 sm:h-8 transition-transform group-hover:scale-105" />
              <span className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">EcoRoute</span>
            </Link>

            {/* Right: Overview pill, Live Dispatch, Analytics, ☰ Menu */}
            <div className="flex items-center gap-5 sm:gap-7">
              <nav className="hidden sm:flex items-center gap-5 sm:gap-7 text-sm font-medium">
                <span className="px-4 py-1.5 rounded-full bg-white/20 text-white backdrop-blur-xs select-none shadow-xs font-semibold">
                  Overview
                </span>
                <Link
                  to="/dispatch"
                  className="text-white/85 hover:text-white transition-colors"
                >
                  Live Dispatch
                </Link>
                <Link
                  to="/analytics"
                  className="text-white/85 hover:text-white transition-colors"
                >
                  Analytics
                </Link>
              </nav>

              {/* Hamburger Menu Toggle Button */}
              <div className="relative" ref={overviewMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsOverviewMenuOpen((prev) => !prev)}
                  className="p-1.5 text-white/90 hover:text-white rounded-lg hover:bg-white/10 transition-colors focus:outline-hidden"
                  title="Menu"
                  aria-label="Menu"
                  aria-expanded={isOverviewMenuOpen}
                >
                  <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>

                {/* Sleek Dark-Glass Dropdown Menu */}
                {isOverviewMenuOpen && (
                  <div className="absolute right-0 mt-3 w-60 rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/15 p-2 shadow-2xl z-50 text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Mobile nav links */}
                    <div className="sm:hidden pb-2 mb-2 border-b border-white/10 flex flex-col gap-1">
                      <Link
                        to="/"
                        onClick={() => setIsOverviewMenuOpen(false)}
                        className="px-3 py-2 rounded-xl text-white font-bold bg-white/15 flex items-center justify-between"
                      >
                        <span>Overview</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                      </Link>
                      <Link
                        to="/dispatch"
                        onClick={() => setIsOverviewMenuOpen(false)}
                        className="px-3 py-2 rounded-xl text-white/85 hover:text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                      >
                        <span>Live Dispatch</span>
                      </Link>
                      <Link
                        to="/analytics"
                        onClick={() => setIsOverviewMenuOpen(false)}
                        className="px-3 py-2 rounded-xl text-white/85 hover:text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                      >
                        <span>Analytics</span>
                      </Link>
                    </div>

                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsOverviewMenuOpen(false);
                          setIsConceptsOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-white/85 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors"
                      >
                        <BookOpen className="w-4 h-4 text-white/70" />
                        <span>Key Concepts & Notes</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleToggleSound}
                        className="w-full text-left px-3 py-2 rounded-xl text-white/85 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors"
                      >
                        {muted ? (
                          <VolumeX className="w-4 h-4 text-white/50" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-white" />
                        )}
                        <span>{muted ? 'Sound Muted' : 'Sound On'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsOverviewMenuOpen(false);
                          handleResetDemo();
                        }}
                        disabled={resetting}
                        className="w-full text-left px-3 py-2 rounded-xl text-white/85 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-2.5 transition-colors"
                      >
                        <RotateCcw className={`w-4 h-4 text-white/70 ${resetting ? 'animate-spin' : ''}`} />
                        <span>Reset Demo</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      ) : (
        /* Existing 100% untouched light-theme navbar for /dispatch, /analytics, etc. */
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            {/* Brand Logo */}
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                <EcoRouteLeafLogo className="w-6.5 h-6.5" />
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

            {/* 3 Navigation Tabs */}
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
              to="/analytics"
              className={({ isActive }) =>
                `px-2 py-1 rounded ${isActive ? 'text-emerald-700 font-bold' : 'text-slate-600'}`
              }
            >
              Centres & Analytics
            </NavLink>
          </div>
        </header>
      )}

      {/* Main Pages Outlet */}
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/dispatch" element={<DispatchPage />} />
          <Route path="/schedule" element={<Navigate to="/dispatch" replace />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<OverviewPage />} />
        </Routes>
      </main>

      {/* Concepts Reference Modal */}
      <ConceptsModal isOpen={isConceptsOpen} onClose={() => setIsConceptsOpen(false)} />
    </div>
  );
}
