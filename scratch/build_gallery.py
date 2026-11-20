import base64
import io
from PIL import Image
from pathlib import Path

BASE_DIR = Path(r"C:\Users\ypiyu\OneDrive\Desktop\EcoRoute\frontend\public")
OUT_FILE = Path(r"C:\Users\ypiyu\.gemini\antigravity\brain\b4490a2d-ecab-473a-b6e3-9a96b47a13c0\hero_gallery.html")
PUBLIC_OUT = BASE_DIR / "hero_gallery.html"

IMAGES = [
    {
        "id": "rover1",
        "title": "1. Delhi Rain Street Scan (Your Favorite)",
        "tag": "Original Selection",
        "desc": "Autonomous all-terrain recovery rover scanning wet Delhi streets at dusk with an omnidirectional emerald LiDAR grid, auto-rickshaws and urban street life in background.",
        "path": BASE_DIR / "hero_rover_original_delhi.jpg"
    },
    {
        "id": "rover2",
        "title": "2. Connaught Place Colonnade",
        "tag": "Heritage Architecture",
        "desc": "Rover in front of the iconic circular white colonnades of Connaught Place, New Delhi at rainy night, projecting emerald laser scan lines across wet cobblestone.",
        "path": BASE_DIR / "hero_rover_connaught_place.jpg"
    },
    {
        "id": "rover3",
        "title": "3. Arterial Flyover Fleet",
        "tag": "Highway Transit",
        "desc": "Tracked autonomous collection rovers traversing multi-level concrete highway flyovers in rain at twilight, sweeping wide emerald LiDAR beams across flyover pillars.",
        "path": BASE_DIR / "hero_rover_flyover_fleet.jpg"
    },
    {
        "id": "rover4",
        "title": "4. Low-Angle Action Splash",
        "tag": "Dynamic Speed",
        "desc": "Low-angle action shot of the tracked rover charging through rain puddles with water spray, projecting a 360-degree emerald LiDAR scan fan and coordinate grid.",
        "path": BASE_DIR / "hero_rover_action_splash.jpg"
    }
]

encoded_data = []
for item in IMAGES:
    with Image.open(item["path"]) as img:
        img.thumbnail((800, 1000), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=88, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        data_uri = f"data:image/jpeg;base64,{b64}"
        encoded_data.append({**item, "src": data_uri})

html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>EcoRoute Rover Variations</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    body {{
      background: #090d16;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }}
    .glow-ring {{
      box-shadow: 0 0 25px rgba(16, 185, 129, 0.4);
    }}
  </style>
</head>
<body class="p-4 sm:p-6 min-h-screen">
  <div class="max-w-5xl mx-auto space-y-6">

    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-800 pb-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span class="text-xs uppercase font-mono tracking-widest text-emerald-400 font-semibold">EcoRoute Autonomous Fleet</span>
        </div>
        <h1 class="text-xl sm:text-2xl font-bold text-white mt-1">Autonomous LiDAR Collection Rover (4 Variations)</h1>
        <p class="text-xs sm:text-sm text-slate-400">Variations of your favorite concept: doorstep collection, LiDAR coordinate mapping, and Delhi urban streetscapes.</p>
      </div>
      <span class="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-mono border border-slate-700">3:4 Portrait</span>
    </div>

    <!-- Interactive Selector Tabs -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3" id="tabContainer">
"""

for i, item in enumerate(encoded_data):
    active_class = "border-emerald-500 bg-emerald-950/40 text-white glow-ring" if i == 0 else "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
    html_content += f"""
      <button onclick="selectOption('{item['id']}')" id="btn-{item['id']}" class="p-3 rounded-xl border text-left transition-all {active_class} flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between text-[11px] font-mono">
            <span class="text-emerald-400 font-semibold">#{i+1}</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{item['tag']}</span>
          </div>
          <div class="text-xs font-bold mt-1 text-slate-100 leading-snug">{item['title']}</div>
        </div>
      </button>
    """

html_content += """
    </div>

    <!-- Active Hero Card Live Simulation -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center bg-slate-900/40 p-4 sm:p-6 rounded-3xl border border-slate-800/80">
      
      <!-- Left: Context Info -->
      <div class="lg:col-span-6 space-y-4">
        <div>
          <span id="activeBadge" class="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-semibold uppercase">Original Selection</span>
          <h2 id="activeTitle" class="text-xl sm:text-2xl font-bold text-white mt-2">1. Delhi Rain Street Scan</h2>
          <p id="activeDesc" class="text-sm text-slate-300 mt-2 leading-relaxed">Autonomous all-terrain recovery rover scanning wet Delhi streets at dusk with an omnidirectional emerald LiDAR grid, auto-rickshaws and urban street life in background.</p>
        </div>

        <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2 text-slate-400 font-mono">
          <div class="flex justify-between">
            <span>Subject:</span>
            <span class="text-slate-200">Autonomous Electric Collection Rover</span>
          </div>
          <div class="flex justify-between">
            <span>Mapping Technology:</span>
            <span class="text-emerald-400 font-semibold">360° Optical LiDAR Coordinate Grid</span>
          </div>
          <div class="flex justify-between">
            <span>Setting:</span>
            <span class="text-slate-200">Delhi NCR Rain-Slicked Streets & Infrastructure</span>
          </div>
        </div>

        <div class="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300">
          💡 The preview on the right shows how this artwork looks inside the live EcoRoute card with glassmorphic badges.
        </div>
      </div>

      <!-- Right: Actual UI Card Mockup -->
      <div class="lg:col-span-6 flex justify-center">
        <div class="w-full max-w-[340px] aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-700/60 relative group bg-slate-950">
          
          <!-- Image -->
          <img id="activeImg" src="" alt="Hero Preview" class="w-full h-full object-cover transition-all duration-300">
          
          <!-- Gradient Overlay -->
          <div class="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/30 to-transparent pointer-events-none"></div>

          <!-- Top Status Tag -->
          <div class="absolute top-4 right-4 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/10 text-emerald-400 text-[10px] font-mono font-medium flex items-center gap-1.5 shadow-lg pointer-events-none">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>HEAPQ ENGINE ACTIVE</span>
          </div>

          <!-- Bottom Glass Plate -->
          <div class="absolute bottom-5 left-5 right-5 p-3.5 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-white/10 text-white space-y-1.5 shadow-xl pointer-events-none">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[9px] uppercase font-mono tracking-wider font-semibold">
                Certified Circular Logistics
              </span>
              <span class="text-[9px] text-slate-300 font-mono">Delhi NCR</span>
            </div>
            <p class="text-sm font-bold text-white leading-snug tracking-tight">
              "Provably optimal routing. Zero toxic landfills."
            </p>
            <div class="pt-1 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-300 font-mono">
              <span>11 Nodes</span>
              <span>18 Edges</span>
              <span>3 Smelters</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Side-by-Side Direct Comparison Grid -->
    <div class="space-y-3 pt-4">
      <h3 class="text-sm uppercase font-mono tracking-wider text-slate-400 font-semibold">Side-by-Side Direct Comparison</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
"""

for item in encoded_data:
    html_content += f"""
        <div onclick="selectOption('{item['id']}')" class="cursor-pointer group space-y-2">
          <div class="aspect-[3/4] rounded-2xl overflow-hidden border border-slate-800 group-hover:border-emerald-500 transition-all bg-slate-950">
            <img src="{item['src']}" alt="{item['title']}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
          </div>
          <div class="text-xs font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors leading-tight">{item['title']}</div>
          <div class="text-[11px] text-slate-500 line-clamp-2">{item['desc']}</div>
        </div>
    """

html_content += f"""
      </div>
    </div>

  </div>

  <script>
    const optionsData = {str({i['id']: i for i in encoded_data}).replace("'", '"')};

    function selectOption(id) {{
      const data = optionsData[id];
      if (!data) return;

      document.getElementById('activeImg').src = data.src;
      document.getElementById('activeTitle').innerText = data.title;
      document.getElementById('activeDesc').innerText = data.desc;
      document.getElementById('activeBadge').innerText = data.tag;

      Object.keys(optionsData).forEach(key => {{
        const btn = document.getElementById('btn-' + key);
        if (key === id) {{
          btn.className = "p-3 rounded-xl border text-left transition-all border-emerald-500 bg-emerald-950/40 text-white glow-ring flex flex-col justify-between";
        }} else {{
          btn.className = "p-3 rounded-xl border text-left transition-all border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200 flex flex-col justify-between";
        }}
      }});
    }}

    selectOption('rover1');
  </script>
</body>
</html>
"""

OUT_FILE.write_text(html_content, encoding="utf-8")
PUBLIC_OUT.write_text(html_content, encoding="utf-8")
print(f"Gallery updated at {OUT_FILE} and {PUBLIC_OUT}")
