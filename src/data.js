import { media } from './env';

// Kept reversed and split so the address never sits in the HTML or as one string in the bundle,
// where scrapers harvest it; it is assembled only when a visitor asks to write.
const MAILBOX = ['29leahcimdnomyar', 'moc.liamg'];

/** Click handler that opens a new draft in the visitor's mail app. */
export function openMail(e, subject = '', body = '') {
  e?.preventDefault();
  const [user, host] = MAILBOX.map((s) => [...s].reverse().join(''));
  const query = new URLSearchParams({ subject, body }).toString().replace(/\+/g, '%20');
  window.location.href = `mailto:${user}@${host}${subject || body ? `?${query}` : ''}`;
}

export const SOCIALS = [
  { label: 'GitHub', href: 'https://github.com/heikojan2010' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/raymond-r-972804aa/' },
];

export const GIANT_LEAD = 'R.M.Roman — engineer specializing in';
export const DISCIPLINES = [
  ['+Python / Django', 'ORM, auth, admin, Channels, REST and GraphQL APIs. The back end does the heavy lifting.'],
  ['+React / Next.js', 'Server-rendered, responsive interfaces built to ship.'],
  ['+3D on the web', 'Real-time Three.js in the browser. This page is the demo.'],
  ['+Applied AI', 'LangGraph agents, MCP integrations, self-hosted models, and fine-tuning and distillation of open LLMs.'],
  ['+Security-minded', 'Practised on OWASP crAPI, Hack The Box, and TryHackMe.'],
];

export const STATEMENT = 'I build web products end to end — from the data model to the deployed interface.';
export const MARQUEE = 'Technology for sustainability';

export const PROJECTS = [
  {
    title: 'Saleor AI Order-Ops Agent',
    subject: 'COPILOT',
    tagline: 'AI agents that work the order queue, with every action audited.',
    status: 'Product · Saleor Marketplace app',
    summary:
      'Merchants lose hours triaging orders, checking fraud signals, and chasing fulfillment. I designed and built a paid Saleor Marketplace app where LangGraph agents handle that queue across Saleor and Shopify stores, while AI assistants get live store data through a read-only MCP server.',
    scope: [
      'LangGraph agents for order triage, fraud-risk review, inventory checks, and fulfillment support',
      'Read-only MCP server over the Saleor GraphQL API covering catalog, orders, customers, payments, and shipping',
      'Single audited mutation client, so every write an agent makes is logged and reviewable',
      'Mission Control dashboard embedded in the Saleor admin, plus a multi-tenant console for agencies',
      'Flexible LLM routing: hosted, bring-your-own-key, or local models on Ollama',
      'Revenue built in: Paddle subscriptions and x402 pay-per-call API access for agents',
    ],
    stack: ['Python', 'LangGraph', 'FastMCP', 'GraphQL', 'Next.js', 'PostgreSQL', 'Celery', 'Docker'],
    poster: media('Images/placeholder.svg'),
  },
  {
    title: 'SF Showing — 3D Art Gallery',
    subject: 'SFSHOWING',
    tagline: 'An immersive online gallery that sells originals.',
    status: 'Client project · Full-stack + 3D',
    summary:
      'An independent artist needed a site that felt like walking into the show and could sell originals without a developer in the loop. I built a scroll-driven 3D gallery with Stripe checkout, managed entirely from a Strapi CMS.',
    scope: [
      'Walkable 3D gallery: corridor, series rooms, neon signage, and eased camera transitions',
      'CMS-to-checkout automation: publishing a piece in Strapi creates its Stripe product, and the payment webhook marks it sold',
      'Store, about, and newsletter pages, swipe navigation on mobile, and deep links straight into any room',
      'Performance tuning: opacity-only animation, no per-frame repaints, and a loader that tracks real asset readiness',
      'Next phases scoped with the client: PostHog funnels, commission inquiries, Printful print-on-demand',
    ],
    stack: ['Next.js', 'React Three Fiber', 'Three.js', 'Strapi', 'Stripe', 'Cloudinary', 'Vercel'],
    poster: media('Images/placeholder.svg'),
  },
  {
    title: 'Saleor Full-Stack Commerce',
    subject: 'SALEOR',
    tagline: 'Own your customer data. Skip the marketplace fees.',
    status: 'Product · Licensable',
    summary:
      'For businesses ready to leave fee-based marketplaces, I deployed a self-hosted commerce platform: Saleor core with a custom Next.js storefront on Vercel. The business owns its data and its margins, and the stack is licensable as a turnkey setup.',
    scope: [
      'Catalog, multi-warehouse inventory, shipping zones, taxes, and staff permissions',
      'Checkout, payments, gift cards, and promotions across B2B and D2C sales channels',
      'Admin dashboard for orders, customers, and stock availability',
      'Containerized back end on Linux with Docker; storefront deployed on Vercel',
    ],
    stack: ['Saleor', 'GraphQL', 'Next.js', 'React', 'Tailwind', 'Docker', 'Linux'],
    video: media('video/saleor.mp4'),
    poster: media('Images/portfolio-logos/SaleorLogo.jpg'),
    href: 'https://saleor-storefront6.vercel.app/',
  },
  {
    title: 'Django Local-AI AssistaBot',
    subject: 'ASSISTABOT',
    tagline: 'A private LLM that takes action, not just answers.',
    status: 'Open source · AI integration',
    summary:
      'Most on-premise assistants stop at chat. I connected a locally hosted Llama 3.2 model to Django through tool calling, so it can run database queries, manage files, and call external APIs, with no third-party inference and no data leaving the machine.',
    scope: [
      'Tool-calling bridge that exposes Django views to the model as callable actions',
      'Fully local inference on Ollama: no API keys, no per-token cost, no data egress',
      'React and Mantine chat interface with a Three.js visual layer',
    ],
    stack: ['Django', 'Python', 'Ollama', 'Llama 3.2', 'React', 'Mantine', 'Three.js'],
    video: media('video/neural.mp4'),
    poster: media('Images/neural.jpg'),
  },
  {
    title: 'Django Chatroom Server',
    subject: 'CHATROOM',
    tagline: 'Real-time chat, authenticated end to end.',
    status: 'Shipped · Real-time web',
    summary:
      'A production-ready public chat built on Django Channels. Authenticated users exchange messages in real time over asynchronous WebSockets, deployed behind Nginx and Gunicorn.',
    scope: [
      'User registration, authentication, and session handling',
      'Asynchronous WebSocket consumers for live, bidirectional messaging',
      'Production deployment with an Nginx reverse proxy and Gunicorn',
    ],
    stack: ['Django Channels', 'WebSockets', 'Nginx', 'Gunicorn', 'Tailwind', 'Three.js'],
    video: media('video/chatroom.mp4'),
    poster: media('Images/portfolio-logos/ChatroomLogo.jpg'),
  },
  {
    title: 'Next.js Commerce',
    subject: 'COMMERCE',
    tagline: 'A fast storefront without the template look.',
    status: 'Shipped · Headless storefront',
    summary:
      'A custom headless storefront that connects to common commerce back ends, giving a store a fast, server-rendered shopping experience and a brand of its own instead of a template.',
    scope: [
      'Headless integration that works with interchangeable commerce back ends',
      'Server-rendered product, collection, and cart pages for speed and SEO',
      'Deployed on Vercel',
    ],
    stack: ['Next.js', 'React', 'Vercel'],
    video: media('video/commercenxt.mp4'),
    poster: media('Images/portfolio-logos/CommerceNxtLogo.jpg'),
  },
  {
    title: '3D Immersive UI',
    subject: 'JSX3',
    tagline: 'Real-time 3D in the browser, no plugins.',
    status: 'Shipped · Creative 3D',
    summary:
      'An interactive fan site built around real-time 3D: animated Three.js scenes that render directly in the browser, with nothing to install.',
    scope: [
      'Scene graph, camera, and animation loop written in plain Three.js',
      'Runs across modern browsers with no plugins',
    ],
    stack: ['Three.js', 'JavaScript', 'HTML', 'CSS'],
    video: media('video/3jsx.mp4'),
    poster: media('Images/portfolio-logos/3jsxLogo.jpg'),
    href: 'https://heikojan2010.github.io/jsx3/',
  },
];

export const DEMOS = [
  { title: 'Python commerce back end', id: '6hH_RwDqG24' },
  { title: 'Shopperbot — browser automation', id: 'XoTLyJUBQmY' },
  { title: 'RESTful API', id: 'aOga6Q5upZE' },
  { title: 'Earthquake data visualization', id: 'Vn3rWF6JLYM' },
  { title: 'Chatroom on Django Channels', id: 'YBCrI1OOENc' },
  { title: 'Next.js commerce', id: 'H9nRxeRBAjY' },
  { title: 'Three.js fan site', id: 'yPWwH6_83Uw' },
  { title: 'Py-Invaders game', id: 'cFZGhK8BzUs' },
];

export const FAQ = [
  ['Are you open to full-time or contract work?', 'Both. I live in New York City and work on site, hybrid, or remote.'],
  ['What is your core stack?', 'Python and Django on the server with REST and GraphQL APIs, React and Next.js in the browser, Docker and Linux underneath. LangGraph when the product needs agents, Three.js when the interface calls for 3D.'],
  ['Can I see the code?', 'Public work is on GitHub. For anything private, I will walk you through the code on a call.'],
  ['Do you build with LLMs?', 'Yes, from integration to the model itself. I build agentic workflows with LangGraph and LangChain, expose tools to assistants over MCP, deploy models locally on Ollama, and fine-tune and distill open models with LoRA on Apple Silicon (MLX). AssistaBot, for example, wires a local Llama 3.2 into Django through tool calling, with no third-party inference.'],
  ['Is the Saleor storefront for sale?', 'Yes. It is a licensable, self-hosted commerce stack: you own your data and pay no marketplace fees.'],
  ['How do you think about security?', 'I practise offensive security on OWASP crAPI, Hack The Box, and TryHackMe. Knowing how APIs get broken changes how I build them.'],
  ['What is the fastest way to reach you?', 'Send a brief below, or open an email draft. Either lands in the same inbox.'],
];

export const BRIEF_NEEDS = ['Full-time role', 'Contract project', 'Saleor storefront', 'AI / LLM integration', '3D / WebGL', 'Something else'];
export const BRIEF_TIMELINES = ['ASAP', '1–3 months', '3–6 months', 'Just exploring'];

export const HOME = { lat: 40.7128, lng: -74.006, label: 'NYC', tag: 'Source code' };

export const TEAM = [
  {
    code: 'T/01 — Full-stack engineer',
    name: 'R.M.Roman',
    copy: 'Writer at heart; now I write code. Python and Django on the server, React and Three.js in the browser.',
    subject: 'Subject: RMR',
    model: 'monogram',
    signal: ['Signal', 'NYC / remote'],
    output: ['Output', 'Full-stack'],
    tags: [['Python'], ['Django', true], ['React'], ['Three.js']],
  },
  {
    code: 'T/02 — Education',
    name: 'B.S. Communication',
    copy: 'Kennesaw State University, cum laude, minor in sociology.',
    subject: 'Subject: KSU',
    model: 'cap',
    signal: ['Signal', 'Cum laude'],
    output: ['Output', 'Communication'],
    tags: [['Org. comm'], ['Sociology', true]],
  },
  {
    code: 'T/03 — Open seat',
    name: '[Searching...]',
    copy: 'Your team. Open to full-time roles and contract work, on site in New York City or remote.',
    subject: 'Searching for next team...',
    vacant: 'Searching for next team',
    meta: 'Commission: full-time / contract // status: open',
    signal: ['Signal', 'Hiring'],
    output: ['Output', 'Shipped work'],
    tags: [['Full-time', true], ['Contract'], ['Remote']],
  },
];

export const SERVICES = [
  {
    kicker: '01 / From schema to server',
    title: 'Python / Django back ends',
    copy: 'ORM, auth, admin, Channels. REST and GraphQL APIs over SQL designed around the queries it has to answer.',
    art: 'flow',
    chips: [['Python'], ['Django', true], ['GraphQL', true], ['SQL'], ['REST'], ['Channels']],
    lit: true,
  },
  {
    kicker: '02 / Models that do things',
    title: 'Applied AI / LLM engineering',
    copy: 'Agentic workflows on LangGraph and LangChain, tool calling and MCP integrations, self-hosted model deployment, LoRA fine-tuning and distillation, and visual interfaces that make model behaviour legible.',
    art: 'graph',
    chips: [['LangGraph', true], ['LangChain'], ['MCP'], ['Ollama'], ['MLX / LoRA', true], ['Llama · Qwen']],
  },
  {
    kicker: '03 / Interfaces that ship',
    title: 'React / Next.js front ends',
    copy: 'Server-rendered, responsive, and fast on every screen.',
    art: 'hemisphere',
    chips: [['React'], ['Next.js', true], ['Tailwind'], ['Vercel']],
  },
  {
    kicker: '04 / Depth on demand',
    title: 'Three.js / WebGL',
    copy: 'Real-time 3D, custom shaders, post-processing. Everything on this page.',
    art: 'dotsphere',
    chips: [['Three.js', true], ['R3F'], ['GLSL'], ['WebGL']],
  },
  {
    kicker: '05 / Break it before they do',
    title: 'Security-minded',
    copy: 'Practice on OWASP crAPI, Hack The Box, and TryHackMe shapes how I build APIs.',
    art: 'radar',
    chips: [['OWASP'], ['crAPI', true], ['HTB'], ['THM']],
  },
  {
    kicker: '06 / Same build everywhere',
    title: 'Docker / Linux / Git',
    copy: 'Reproducible environments from laptop to production, behind Nginx and Gunicorn.',
    art: 'bars',
    chips: [['Docker', true], ['Linux'], ['Git'], ['Nginx'], ['Gunicorn', true]],
    lit: true,
  },
];
