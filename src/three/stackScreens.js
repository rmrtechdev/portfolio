import * as THREE from 'three';

const CODE = [
  '# views.py',
  'from agents import plan, run_tools',
  '',
  'class ToolCall(View):',
  '    def post(self, request):',
  '        msg = json.loads(request.body)',
  '        reply = ollama.chat(',
  "            model='llama3.2',",
  '            messages=msg,',
  '            tools=TOOLS,',
  '        )',
  '        return run_tools(reply)',
  '',
  '// Globe.jsx',
  'export default function Globe() {',
  '  const spin = useRef(0);',
  '  return <Canvas dpr={1}>',
  '    <Earth spin={spin} />',
  '  </Canvas>;',
  '}',
];
const TOTAL = CODE.reduce((n, l) => n + l.length + 1, 0);
const KEYWORDS = /^(class|def|return|export|default|function|const|from|import)$/;
const TOKENS = /('[^']*'|\s+|[()[\]{}.,:=<>/;])/;

function texture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Editor on the main monitor: the file types itself out a character at a time, then starts over. */
export function codeScreen() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 588;
  const ctx = c.getContext('2d');
  const tex = texture(c);
  let shown = -1;
  const draw = (t) => {
    const typed = (Math.floor(t * 24) + 300) % (TOTAL + 72);
    const blink = Math.floor(t * 2.4) % 2;
    const key = typed * 2 + blink;
    if (key === shown) return;
    shown = key;
    ctx.fillStyle = '#04080a';
    ctx.fillRect(0, 0, 1024, 588);
    ctx.fillStyle = '#0a1214';
    ctx.fillRect(0, 0, 1024, 38);
    ctx.font = '17px monospace';
    ['views.py', 'Globe.jsx', 'stack.js'].forEach((name, i) => {
      ctx.fillStyle = i === 0 ? '#0f1c1e' : '#0a1214';
      ctx.fillRect(8 + i * 150, 4, 144, 34);
      ctx.fillStyle = i === 0 ? '#c6c6c2' : '#4d605c';
      ctx.fillText(name, 24 + i * 150, 27);
      if (i === 0) (ctx.fillStyle = '#08fdd8'), ctx.fillRect(8, 36, 144, 2);
    });
    ctx.fillStyle = '#ff69b4';
    ctx.fillRect(976, 15, 9, 9);
    let left = typed;
    let row = 0;
    let col = 0;
    ctx.font = '19px monospace';
    for (let i = 0; i < CODE.length && left >= 0; i++) {
      const line = CODE[i].slice(0, left);
      left -= CODE[i].length + 1;
      const y = 70 + i * 24.5;
      ctx.fillStyle = '#2c4440';
      ctx.fillText(String(i + 1).padStart(2), 14, y);
      const comment = /^\s*(#|\/\/)/.test(line);
      let x = 70;
      for (const tok of line.split(TOKENS)) {
        if (!tok) continue;
        ctx.fillStyle = comment ? '#5f7a74' : KEYWORDS.test(tok) ? '#ff69b4' : tok[0] === "'" ? '#b8fff3' : /^[A-Z]/.test(tok) ? '#08fdd8' : /^[()[\]{}.,:=<>/;]$/.test(tok) ? '#6f8f88' : '#9ad8c4';
        ctx.fillText(tok, x, y);
        x += ctx.measureText(tok).width;
      }
      row = i;
      col = line.length;
      if (left < 0) ctx.fillStyle = 'rgba(8, 253, 216, 0.06)', ctx.fillRect(56, y - 18, 860, 24);
    }
    if (blink) {
      ctx.fillStyle = '#08fdd8';
      ctx.fillRect(70 + col * ctx.measureText('m').width, 70 + row * 24.5 - 17, 10, 21);
    }
    CODE.forEach((l, i) => {
      ctx.fillStyle = i === row ? '#08fdd8' : '#1d2f2c';
      ctx.fillRect(944, 52 + i * 6, Math.min(64, l.length * 1.6), 3);
    });
    ctx.strokeStyle = '#2c4440';
    ctx.strokeRect(940, 48 + Math.max(0, row - 8) * 6, 70, 60);
    ctx.fillStyle = '#0a1214';
    ctx.fillRect(0, 556, 1024, 32);
    ctx.fillStyle = '#08fdd8';
    ctx.fillRect(0, 556, 104, 32);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#04080a';
    ctx.fillText(left < 0 ? 'INSERT' : 'NORMAL', 18, 578);
    ctx.fillStyle = '#8fa39e';
    ctx.fillText(`main  views.py   Ln ${row + 1}, Col ${col + 1}   UTF-8   python`, 122, 578);
    ctx.fillStyle = '#ff69b4';
    ctx.fillText('● 2', 960, 578);
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

const LOG = [
  '$ bun run build',
  'vite v5.4  building for production',
  '✓ 412 modules transformed',
  'dist/index.js   188.4 kB  gzip 61.2',
  'GET  /api/agents        200   14ms',
  'POST /api/tools/call    200   92ms',
  'ws   /stream  connected  peer=rmr',
  'llama3.2  tok/s 48.6  ctx 8192',
  'pytest -q   58 passed  in 3.41s',
  'docker  stack up  4/4 healthy',
  'GET  /api/globe/visits  200   8ms',
  'nmap  10.0.0.0/24   3 hosts up',
];

/** Second monitor: a scrolling terminal over two live load graphs. */
export function termScreen() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 400;
  const ctx = c.getContext('2d');
  const tex = texture(c);
  const a = new Float32Array(64);
  const b = new Float32Array(64);
  let step = -1;
  const draw = (t) => {
    const k = Math.floor(t * 8);
    if (k === step) return;
    step = k;
    a.copyWithin(0, 1);
    b.copyWithin(0, 1);
    a[63] = 0.5 + 0.28 * Math.sin(t * 1.3) + 0.18 * Math.sin(t * 4.7 + 1) + 0.08 * Math.random();
    b[63] = 0.3 + 0.12 * Math.sin(t * 0.7 + 2) + 0.1 * Math.random();
    ctx.fillStyle = '#030607';
    ctx.fillRect(0, 0, 640, 400);
    ctx.fillStyle = '#0a1214';
    ctx.fillRect(0, 0, 640, 28);
    ctx.font = '15px monospace';
    ctx.fillStyle = '#8fa39e';
    ctx.fillText('rmr@stack: ~/portfolio', 14, 19);
    ctx.fillStyle = '#ff69b4';
    ctx.fillText('●', 604, 19);
    ctx.font = '17px monospace';
    const first = Math.floor(t / 0.7);
    for (let i = 0; i < 9; i++) {
      const line = LOG[(first + i) % LOG.length];
      ctx.fillStyle = line[0] === '$' ? '#08fdd8' : line[0] === '✓' ? '#b8fff3' : '#6f8f88';
      ctx.fillText(line, 14, 54 + i * 21);
    }
    if (Math.floor(t * 2.4) % 2) (ctx.fillStyle = '#08fdd8'), ctx.fillRect(14, 54 + 8 * 21 + 6, 9, 16);
    ctx.strokeStyle = '#13211f';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(14, 262 + i * 30);
      ctx.lineTo(626, 262 + i * 30);
      ctx.stroke();
    }
    const plot = (arr, colour) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      arr.forEach((v, i) => ctx[i ? 'lineTo' : 'moveTo'](14 + i * 9.7, 382 - v * 120));
      ctx.stroke();
    };
    plot(b, '#ff69b4');
    plot(a, '#08fdd8');
    ctx.font = '14px monospace';
    ctx.fillStyle = '#08fdd8';
    ctx.fillText(`gpu ${Math.round(a[63] * 100)}%`, 520, 254);
    ctx.fillStyle = '#ff69b4';
    ctx.fillText(`net ${Math.round(b[63] * 100)}%`, 430, 254);
    tex.needsUpdate = true;
  };
  return { tex, draw };
}
