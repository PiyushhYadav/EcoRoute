import React from 'react';
import { Link } from 'react-router-dom';
import { Play, BarChart3 } from 'lucide-react';

export default function OverviewPage() {
  return (
    <div className="relative w-full min-h-screen lg:h-screen lg:overflow-hidden bg-[#061126] flex flex-col justify-center select-none">
      {/* Background Hero Artwork */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
        <img
          src="/hero-bg.png"
          alt="EcoRoute Twilight Horizon"
          className="w-full h-full object-cover object-right"
        />

        {/* Subtle, seamless horizontal CSS gradient overlay: deep navy on left, fades out to natural sunset on right */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(6, 17, 38, 0.88) 0%, rgba(6, 17, 38, 0.62) 38%, rgba(6, 17, 38, 0.15) 65%, rgba(6, 17, 38, 0) 100%)',
          }}
        />

        {/* Very faint top vignette for navbar legibility */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(6, 17, 38, 0.45) 0%, rgba(6, 17, 38, 0) 18%)',
          }}
        />
      </div>

      {/* Hero Content Layer */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 pt-28 pb-12 sm:pt-32 sm:pb-16 lg:py-0 flex flex-col justify-center lg:-translate-y-8">
        <div className="max-w-3xl">
          {/* Main Heading (exact 2 lines, bold white modern sans-serif) */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[66px] xl:text-[72px] font-extrabold text-white tracking-tight leading-[1.08]">
            Optimal Routes.<br />
            <span className="md:whitespace-nowrap">Zero Toxic Landfills.</span>
          </h1>

          {/* Subtitle + Vertical Accent Line */}
          <div className="flex items-stretch gap-4 mt-7 sm:mt-8 max-w-xl">
            <div className="w-[2.5px] rounded-full bg-white/90 shrink-0 self-stretch my-0.5" />
            <p className="text-base sm:text-lg md:text-[19px] text-white/85 font-normal leading-relaxed">
              Dijkstra-powered e-waste routing and<br className="hidden sm:inline" /> capacity-aware dispatch across Delhi NCR.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-4 mt-8 sm:mt-10">
            {/* Primary Button: Launch Simulator */}
            <Link
              to="/dispatch"
              className="inline-flex items-center gap-3 px-6 sm:px-7 py-3 sm:py-3.5 rounded-full bg-white hover:bg-slate-100 text-[#061126] font-semibold text-sm sm:text-base shadow-lg transition-all duration-200 active:scale-95 group"
            >
              <Play className="w-4 h-4 fill-[#061126] text-[#061126]" />
              <span>Launch Simulator</span>
            </Link>

            {/* Secondary Button: View Analytics */}
            <Link
              to="/analytics"
              className="inline-flex items-center gap-2.5 px-6 sm:px-7 py-3 sm:py-3.5 rounded-full bg-transparent hover:bg-white/10 text-white border border-white/80 hover:border-white font-semibold text-sm sm:text-base transition-all duration-200 active:scale-95 group"
            >
              <BarChart3 className="w-4 h-4 text-white" />
              <span>View Analytics</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
