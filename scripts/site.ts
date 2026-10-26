// Builds the GitHub Pages site in docs/: the home page in English (/) and Portuguese (/pt/), a G and
// M code reference per control made from the control files and the learning help, and the sitemap.
// Run with `npm run site`; screenshots come from `npm run screens`.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { loadControl, type Control } from '../src/core'
import { HELP } from '../src/i18n/help'

const root = resolve(import.meta.dirname, '..')
const SITE = 'https://ismael-figueiredo.github.io/cnc-simulator'
const REPO = 'https://github.com/ismael-figueiredo/cnc-simulator'
const RELEASES = `${REPO}/releases/latest`
const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version
const today = new Date().toISOString().slice(0, 10)

type Lang = 'en' | 'pt'
const htmlLang: Record<Lang, string> = { en: 'en', pt: 'pt-BR' }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Pages of the site, with their address in each language (for hreflang and the sitemap). */
const PAGES = {
  home: { en: '/', pt: '/pt/' },
  codes: { en: '/g-codes/', pt: '/pt/codigos-g/' }
} as const
type PageId = keyof typeof PAGES

const CSS = `
@font-face{font-family:'Barlow Condensed';font-weight:600;font-display:swap;src:url(FONTS/barlow-condensed-600.woff2) format('woff2')}
@font-face{font-family:'Barlow Condensed';font-weight:700;font-display:swap;src:url(FONTS/barlow-condensed-700.woff2) format('woff2')}
:root{--bg:#0e1215;--panel:#141a1f;--line:#233142;--text:#e6edf3;--muted:#9fb0c0;--accent:#f5b800;--warm:#f5b800;--brand:'Barlow Condensed','DIN Condensed','Arial Narrow',sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.6 -apple-system,'Segoe UI',Roboto,sans-serif}
a{color:var(--accent)}img{max-width:100%;height:auto}
.lockup{display:flex;align-items:center;gap:12px;color:var(--text);text-decoration:none}.lockup img{width:44px;height:44px}
.lockup .name{font:700 28px/1 var(--brand);letter-spacing:.02em;text-transform:uppercase}.lockup .tag{font:600 12px var(--brand);letter-spacing:.22em;color:var(--accent);text-transform:uppercase;margin-top:3px}
nav a{font:600 16px var(--brand);letter-spacing:.06em;text-transform:uppercase;text-decoration:none}
h1,h2,h3,.btn,summary{font-family:var(--brand)}h1{font-weight:700;letter-spacing:.01em}h2{font-weight:700;text-transform:uppercase;letter-spacing:.04em}h3{font-weight:600;font-size:21px;letter-spacing:.02em}
.btn{font-weight:600;font-size:18px;letter-spacing:.04em}summary{font-weight:600;font-size:19px}
.wrap{max-width:1100px;margin:0 auto;padding:0 16px}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 0;flex-wrap:wrap}
nav{display:flex;gap:16px;font-size:15px;flex-wrap:wrap}
.hero{padding:36px 0 20px;text-align:center}
h1{font-size:clamp(30px,5vw,48px);line-height:1.15;margin:0 0 14px}
h2{font-size:28px;margin:52px 0 14px}h3{margin:0 0 6px;font-size:18px}
.lead{color:var(--muted);font-size:19px;max-width:780px;margin:0 auto 26px}
.downloads{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
.btn{display:inline-block;text-decoration:none;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:11px 18px;font-weight:600}
.btn.primary{background:var(--warm);color:#111;border-color:var(--warm)}
.small{font-size:14px;color:var(--muted)}
figure{margin:28px 0}figure img{display:block;border:1px solid var(--line);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
figcaption{color:var(--muted);font-size:14px;margin-top:8px;text-align:center}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px}.card p{margin:0;color:var(--muted);font-size:15px}
ul.features{columns:2 320px;padding-left:18px;color:var(--muted)}ul.features li{margin-bottom:8px;break-inside:avoid}ul.features b{color:var(--text)}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}
details{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin-bottom:8px}summary{cursor:pointer;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:15px;margin:10px 0 30px}th,td{text-align:left;vertical-align:top;padding:7px 10px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600}td.code{font:600 15px ui-monospace,Menlo,Consolas,monospace;white-space:nowrap;color:var(--warm)}
.toc{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 20px}
footer{border-top:1px solid var(--line);margin-top:56px;padding:20px 0 40px;color:var(--muted);font-size:14px}
`

interface PageOptions {
  lang: Lang
  page: PageId
  title: string
  description: string
  body: string
  /** schema.org objects for this page. */
  data: object[]
  image?: string
}

/** Link from one page of the site to another path, relative, so the pages also work opened from the disk. */
function relative(from: string, to: string): string {
  const up = '../'.repeat(from.split('/').filter(Boolean).length)
  return `${up}${to.replace(/^\//, '')}` || './'
}

function layout({ lang, page, title, description, body, data, image = 'img/machine-mill-en.jpg' }: PageOptions): string {
  const url = `${SITE}${PAGES[page][lang]}`
  const here = PAGES[page][lang]
  const to = (path: string) => relative(here, path)
  const other: Lang = lang === 'en' ? 'pt' : 'en'
  const t = (en: string, pt: string) => (lang === 'en' ? en : pt)
  return `<!doctype html>
<html lang="${htmlLang[lang]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en" href="${SITE}${PAGES[page].en}">
<link rel="alternate" hreflang="pt-BR" href="${SITE}${PAGES[page].pt}">
<link rel="alternate" hreflang="x-default" href="${SITE}${PAGES[page].en}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="CNC Simulator">
<meta property="og:locale" content="${lang === 'en' ? 'en_US' : 'pt_BR'}">
<meta property="og:locale:alternate" content="${lang === 'en' ? 'pt_BR' : 'en_US'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/social.png">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/social.png">
<link rel="icon" type="image/png" href="${to('/img/favicon.png')}">
<link rel="apple-touch-icon" href="${to('/img/icon.png')}">
<link rel="preload" as="image" href="${to(`/${image}`)}">
<style>${CSS.replace(/\n/g, '').replace(/FONTS\//g, to('/fonts/'))}</style>
${data.map((d) => `<script type="application/ld+json">${JSON.stringify(d)}</script>`).join('\n')}
</head>
<body>
<div class="wrap">
<header>
  <a class="lockup" href="${to(PAGES.home[lang])}"><img src="${to('/img/icon.png')}" width="44" height="44" alt=""><span><span class="name">CNC Simulator</span><br><span class="tag">${t('G-code · Lathe · Mill', 'G-code · Torno · Fresa')}</span></span></a>
  <nav>
    <a href="${to(PAGES.home[lang])}#download">${t('Download', 'Baixar')}</a>
    <a href="${to(PAGES.codes[lang])}">${t('G-code reference', 'Códigos G e M')}</a>
    <a href="${REPO}">GitHub</a>
    <a href="${to(PAGES[page][other])}" hreflang="${htmlLang[other]}" lang="${htmlLang[other]}">${other === 'pt' ? 'Português' : 'English'}</a>
  </nav>
</header>
${body}
<footer>
  ${t('Free software under the GPL-3.0 license, made for the CNC community. Control and machine names belong to their makers; this project is not affiliated with them.', 'Software livre sob a licença GPL-3.0, feito para a comunidade CNC. Os nomes de comandos e máquinas pertencem aos fabricantes; este projeto não tem vínculo com eles.')}
  · <a href="${REPO}/issues">${t('Report a problem', 'Relatar um problema')}</a>
  · <a href="${REPO}/discussions">${t('Questions', 'Dúvidas')}</a>
  · <a href="${REPO}/blob/main/CONTRIBUTING.md">${t('Contributing', 'Como contribuir')}</a>
  · v${version}
</footer>
</div>
${page === 'home' ? DOWNLOAD_SCRIPT : ''}
</body>
</html>
`
}

// Direct links to the installers of the latest release; the buttons keep the release page if this fails
const DOWNLOAD_SCRIPT = `<script>
const match={win:(n)=>n.endsWith('-setup.exe'),'mac-arm':(n)=>n.endsWith('-arm64.dmg'),'mac-intel':(n)=>n.endsWith('-x64.dmg'),linux:(n)=>n.endsWith('.AppImage'),deb:(n)=>n.endsWith('.deb')}
fetch('https://api.github.com/repos/ismael-figueiredo/cnc-simulator/releases/latest').then((r)=>r.ok?r.json():Promise.reject(r.status)).then((release)=>{
const v=document.getElementById('version');if(v)v.textContent=release.tag_name+' · '
const links={}
for(const a of document.querySelectorAll('[data-os]')){const asset=release.assets.find((x)=>match[a.dataset.os](x.name));if(asset)a.href=links[a.dataset.os]=asset.browser_download_url}
const ua=navigator.userAgent;const os=/Windows/.test(ua)?'win':/Linux/.test(ua)?'linux':null
if(os&&links[os])document.getElementById('dl-main').href=links[os]}).catch(()=>{})
</script>`

interface Faq {
  q: string
  a: string
}

function home(lang: Lang): string {
  const t = (en: string, pt: string) => (lang === 'en' ? en : pt)
  const img = (name: string) => `img/${name}-${lang}.jpg`
  const src = (name: string) => relative(PAGES.home[lang], `/${img(name)}`)
  const faq: Faq[] =
    lang === 'en'
      ? [
          { q: 'Is CNC Simulator free?', a: 'Yes. It is free and open-source software under the GPL-3.0 license: no account, no ads, no time limit.' },
          { q: 'Which systems does it run on?', a: 'Windows 10 and 11, macOS (Apple Silicon and Intel) and Linux (AppImage and .deb).' },
          { q: 'Which CNC controls does it simulate?', a: 'Fanuc 0i-TF (lathe) and 0i-MF (machining center), the Romi GL and D lines, Mitsubishi M80 lathe and machining center, and Haas NGC mill. Machines and controls are JSON files, so new ones can be added.' },
          { q: 'Can I check a CAM program before running it on the machine?', a: 'Yes. Open the program, pick the machine and control, and run it: the simulator stops on the control’s own alarms and warns about travel limits, holder and chuck collisions and tool offsets.' },
          { q: 'Does it run parametric programs (Macro B)?', a: 'Yes: variables, math functions, IF/GOTO, WHILE/DO loops and G65 macro calls run as on the control.' },
          { q: 'Can I learn CNC programming with it?', a: 'Yes. The machine screen looks like a control, with MDI keys and an operator panel; the learning mode explains every code; and guided exercises check your program against the expected part.' }
        ]
      : [
          { q: 'O CNC Simulator é gratuito?', a: 'Sim. É software livre e de código aberto sob a licença GPL-3.0: sem cadastro, sem propaganda e sem prazo.' },
          { q: 'Em quais sistemas ele funciona?', a: 'Windows 10 e 11, macOS (Apple Silicon e Intel) e Linux (AppImage e .deb).' },
          { q: 'Quais comandos CNC ele simula?', a: 'Fanuc 0i-TF (torno) e 0i-MF (centro de usinagem), as linhas Romi GL e D, Mitsubishi M80 torno e centro de usinagem, e Haas NGC fresadora. Máquinas e comandos são arquivos JSON, então dá para acrescentar outros.' },
          { q: 'Dá para conferir um programa do CAM antes de rodar na máquina?', a: 'Sim. Abra o programa, escolha a máquina e o comando e execute: o simulador para nos alarmes do próprio comando e avisa sobre fim de curso, colisão de suporte e de placa e corretores de ferramenta.' },
          { q: 'Ele roda programação parametrizada (Macro B)?', a: 'Sim: variáveis, funções matemáticas, IF/GOTO, laços WHILE/DO e chamadas de macro G65 rodam como no comando.' },
          { q: 'Dá para aprender programação CNC com ele?', a: 'Sim. A tela de máquina é como a de um comando, com teclado MDI e painel de operação; o modo aprender explica cada código; e os exercícios guiados conferem o seu programa com a peça esperada.' }
        ]
  const body = `
<section class="hero">
  <h1>${t('Free CNC simulator to learn and test G-code', 'Simulador CNC grátis para aprender e testar G-code')}</h1>
  <p class="lead">${t(
    'Run lathe and machining center programs as on the machine: Fanuc, Mitsubishi and Haas controls, Macro B parametric programs, the control’s own alarms and collision checks, in 3D. No machine needed.',
    'Rode programas de torno e centro de usinagem como na máquina: comandos Fanuc, Mitsubishi e Haas, programação parametrizada Macro B, os alarmes do próprio comando e a verificação de colisões, em 3D. Sem precisar da máquina.'
  )}</p>
  <div class="downloads" id="download">
    <a class="btn primary" id="dl-main" href="${RELEASES}">${t('Download for free', 'Baixar grátis')}</a>
    <a class="btn" data-os="win" href="${RELEASES}">Windows</a>
    <a class="btn" data-os="mac-arm" href="${RELEASES}">macOS Apple Silicon</a>
    <a class="btn" data-os="mac-intel" href="${RELEASES}">macOS Intel</a>
    <a class="btn" data-os="linux" href="${RELEASES}">Linux AppImage</a>
    <a class="btn" data-os="deb" href="${RELEASES}">Linux .deb</a>
  </div>
  <p class="small"><span id="version">v${version} · </span>${t(
    'The app is not signed: on Windows choose <b>More info → Run anyway</b>; on macOS right-click the app → <b>Open</b>.',
    'O app não é assinado: no Windows escolha <b>Mais informações → Executar assim mesmo</b>; no macOS clique com o botão direito no app → <b>Abrir</b>.'
  )}</p>
  <figure><img src="${src('machine-mill')}" width="1200" height="737" alt="${esc(t('CNC Simulator machine screen running a machining center program: position, spindle and feed, 3D toolpath, the program, MDI keys and operator panel', 'Tela de máquina do CNC Simulator rodando um programa de centro de usinagem: posição, rotação e avanço, percurso 3D, o programa, teclado MDI e painel de operação'))}" fetchpriority="high">
  <figcaption>${t('The machine screen: display, soft keys, MDI keys and operator panel, as on a control.', 'A tela de máquina: display, softkeys, teclado MDI e painel de operação, como num comando.')}</figcaption></figure>
</section>

<h2>${t('Who it is for', 'Para quem é')}</h2>
<div class="grid">
  <div class="card"><h3>${t('CNC students', 'Quem está aprendendo CNC')}</h3><p>${t('Write a program, run it block by block and see what each code does and which alarm the control would give, without risking a machine.', 'Escreva o programa, rode bloco a bloco e veja o que cada código faz e qual alarme o comando daria, sem arriscar a máquina.')}</p></div>
  <div class="card"><h3>${t('CNC programmers', 'Programadores CNC')}</h3><p>${t('Check what the CAM post-processor made before it reaches the machine: alarms, travel limits, holder and chuck collisions, tool offsets.', 'Confira o que o pós-processador do CAM gerou antes de chegar na máquina: alarmes, fim de curso, colisão de suporte e de placa, corretores.')}</p></div>
  <div class="card"><h3>${t('Teachers and technical schools', 'Professores e escolas técnicas')}</h3><p>${t('Free for every student to install at home, with lathe and machining center examples and guided exercises.', 'Gratuito para cada aluno instalar em casa, com exemplos de torno e centro de usinagem e exercícios guiados.')}</p></div>
  <div class="card"><h3>${t('Parametric programming', 'Programação parametrizada')}</h3><p>${t('Learn and test Macro B: variables, IF/WHILE and G65 calls run as on the control.', 'Aprenda e teste Macro B: variáveis, IF/WHILE e chamadas G65 rodam como no comando.')}</p></div>
</div>

<h2>${t('Lathe and machining center simulation', 'Simulação de torno e centro de usinagem')}</h2>
<div class="two">
  <figure><img src="${src('model-lathe')}" width="1200" height="737" loading="lazy" alt="${esc(t('3D model of a lathe program: the turned part, the toolpath, the document tree and the program', 'Modelo 3D de um programa de torno: a peça torneada, o percurso, a árvore do documento e o programa'))}">
  <figcaption>${t('3D model screen: exact standard views, view cube, the operations of each tool.', 'Tela Modelo 3D: vistas padrão exatas, cubo de vistas, as operações de cada ferramenta.')}</figcaption></figure>
  <figure><img src="${src('start')}" width="1200" height="737" loading="lazy" alt="${esc(t('Start screen with examples and pictures of each finished part', 'Tela inicial com os exemplos e a imagem de cada peça pronta'))}">
  <figcaption>${t('Start screen: examples, exercises and recent files with a picture of the part.', 'Tela inicial: exemplos, exercícios e arquivos recentes com a imagem da peça.')}</figcaption></figure>
</div>
<ul class="features">
  ${(lang === 'en'
    ? [
        '<b>G-code like the control:</b> Fanuc, Mitsubishi and Haas dialects, canned cycles, subprograms (M98/M99, Haas M97), G41/G42 cutter and nose radius compensation, polar interpolation G12.1.',
        '<b>Lathe cycles:</b> G71/G72 roughing, G73 pattern repeating, G70 finishing, G90/G94 single cycles, G76 threading and G32 thread cutting.',
        '<b>The control’s alarms:</b> program errors stop at the block with the control’s number and message (for example PS0010 IMPROPER G-CODE).',
        '<b>Material removal in 3D:</b> the bar is turned and the block is milled as the program runs; a picture of the finished part.',
        '<b>Collisions:</b> holder into the stock, tool into the chuck jaws; travel limits from the machine’s own travels.',
        '<b>Tool and work offsets:</b> OFFSET screen with H/D or lathe geometry and wear, G54–G59, G54.1 and Haas G154, G10.',
        '<b>Operator panel:</b> single block, optional stop M01, block delete, feed, rapid and spindle override knobs, breakpoints.',
        '<b>Learning mode and exercises:</b> every G/M code explained on hover; exercises checked against the expected part.'
      ]
    : [
        '<b>G-code como no comando:</b> dialetos Fanuc, Mitsubishi e Haas, ciclos fixos, subprogramas (M98/M99, Haas M97), compensação de raio da fresa e da ponta G41/G42, interpolação polar G12.1.',
        '<b>Ciclos de torno:</b> desbaste G71/G72, repetição de perfil G73, acabamento G70, ciclos simples G90/G94, rosca G76 e G32.',
        '<b>Alarmes do comando:</b> erros de programa param no bloco com o número e a mensagem do comando (por exemplo PS0010 IMPROPER G-CODE).',
        '<b>Remoção de material em 3D:</b> a barra é torneada e o bloco é fresado conforme o programa roda; imagem da peça pronta.',
        '<b>Colisões:</b> suporte entrando no blank, ferramenta batendo nas castanhas; fim de curso pelos cursos da máquina.',
        '<b>Corretores e zeros de peça:</b> tela OFFSET com H/D ou geometria e desgaste do torno, G54–G59, G54.1 e Haas G154, G10.',
        '<b>Painel de operação:</b> bloco a bloco, parada opcional M01, salto de bloco, knobs de override de avanço, rápido e árvore, pontos de parada.',
        '<b>Modo aprender e exercícios:</b> cada código G/M explicado ao passar o mouse; exercícios conferidos com a peça esperada.'
      ]
  )
    .map((x) => `<li>${x}</li>`)
    .join('\n  ')}
</ul>

<h2>${t('Machines and controls included', 'Máquinas e comandos incluídos')}</h2>
<p>${t(
    'Romi GL 250 M and GL 300 lathes and Romi D600, D1000 and D1250 machining centers with Fanuc 0i; Mitsubishi M80 lathe and machining center; Haas VF-2 and VF-5/40 with the Haas NGC control; a generic 3-axis machining center. Each machine and control is a JSON file: see the <a href="' + REPO + '/blob/main/CONTRIBUTING.md">contributing guide</a> to add yours. All the codes of each control are in the <a href="' + relative(PAGES.home[lang], PAGES.codes[lang]) + '">G and M code reference</a>.',
    'Tornos Romi GL 250 M e GL 300 e centros de usinagem Romi D600, D1000 e D1250 com Fanuc 0i; Mitsubishi M80 torno e centro de usinagem; Haas VF-2 e VF-5/40 com o comando Haas NGC; um centro de usinagem 3 eixos genérico. Cada máquina e comando é um arquivo JSON: veja o <a href="' + REPO + '/blob/main/CONTRIBUTING.md">guia de contribuição</a> para acrescentar a sua. Todos os códigos de cada comando estão na <a href="' + relative(PAGES.home[lang], PAGES.codes[lang]) + '">referência de códigos G e M</a>.'
  )}</p>

<h2>${t('Frequently asked questions', 'Perguntas frequentes')}</h2>
${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n')}
`
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'CNC Simulator',
      alternateName: lang === 'pt' ? 'Simulador CNC' : 'CNC G-code simulator',
      description: t('Free, open-source CNC simulator to learn and test G-code for lathes and machining centers.', 'Simulador CNC gratuito e de código aberto para aprender e testar G-code de tornos e centros de usinagem.'),
      applicationCategory: 'EducationalApplication',
      applicationSubCategory: 'CNC simulation',
      operatingSystem: 'Windows 10, Windows 11, macOS, Linux',
      softwareVersion: version,
      license: 'https://www.gnu.org/licenses/gpl-3.0.html',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: lang === 'pt' ? 'BRL' : 'USD' },
      downloadUrl: RELEASES,
      url: `${SITE}${PAGES.home[lang]}`,
      inLanguage: ['en', 'pt-BR', 'es'],
      screenshot: [`${SITE}/${img('machine-mill')}`, `${SITE}/${img('model-lathe')}`, `${SITE}/${img('start')}`],
      image: `${SITE}/social.png`,
      author: { '@type': 'Person', name: 'Ismael Figueiredo', url: 'https://github.com/ismael-figueiredo' },
      codeRepository: REPO
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
    }
  ]
  return layout({
    lang,
    page: 'home',
    title: t('CNC Simulator: free G-code simulator for lathe and mill (Fanuc, Haas)', 'Simulador CNC grátis: torno e centro de usinagem, Fanuc e Haas | CNC Simulator'),
    description: t(
      'Free, open-source CNC simulator for Windows, macOS and Linux. Learn and test G-code for lathes and machining centers: Fanuc, Mitsubishi and Haas controls, Macro B, alarms and collisions in 3D.',
      'Simulador CNC gratuito e de código aberto para Windows, macOS e Linux. Aprenda e teste G-code de torno e centro de usinagem: comandos Fanuc, Mitsubishi e Haas, Macro B, alarmes e colisões em 3D.'
    ),
    body,
    data,
    image: img('machine-mill')
  })
}

/** The controls in the reference, with the name shown and an anchor. */
const REFERENCE: { id: string; anchor: string; name: Record<Lang, string> }[] = [
  { id: 'fanuc-0i-tf-system-b', anchor: 'fanuc-lathe', name: { en: 'Fanuc 0i-TF lathe (G-code system B, Romi GL)', pt: 'Torno Fanuc 0i-TF (sistema de códigos G B, Romi GL)' } },
  { id: 'fanuc-0i-mf', anchor: 'fanuc-mill', name: { en: 'Fanuc 0i-MF machining center', pt: 'Centro de usinagem Fanuc 0i-MF' } },
  { id: 'haas-ngc-mill', anchor: 'haas-mill', name: { en: 'Haas NGC mill', pt: 'Fresadora Haas NGC' } }
]

const codeNumber = (c: string) => {
  const m = /^[GM](\d+)(?:\.(\d+))?/.exec(c)
  return m ? Number(m[1]) + Number(m[2] ?? 0) / 100 : 0
}

function codes(lang: Lang): string {
  const t = (en: string, pt: string) => (lang === 'en' ? en : pt)
  const pick = (text: unknown): string => {
    if (typeof text === 'string') return text
    const r = text as Record<string, string> | undefined
    return r?.[htmlLang[lang]] ?? r?.['en'] ?? ''
  }
  const sections = REFERENCE.map((ref) => {
    const r = loadControl(readFileSync(join(root, `configs/controls/${ref.id}.json`), 'utf8'))
    if (!r.ok) throw new Error(`${ref.id}: invalid control file`)
    const control: Control = r.value
    const table = (kind: 'g' | 'm', entries: [string, { function: string; description?: unknown }][]) =>
      `<table><thead><tr><th>${t('Code', 'Código')}</th><th>${t('What it does', 'O que faz')}</th></tr></thead><tbody>
${entries
  .sort(([a], [b]) => codeNumber(a) - codeNumber(b))
  .map(([code, e]) => {
    const own = e.description ? pick(e.description) : ''
    const help = pick(HELP[`${kind}:${e.function}`] ?? HELP[`${kind}:other`])
    const text = own && own !== help ? `<b>${esc(own)}.</b> ${esc(help)}` : esc(help)
    return `<tr id="${ref.anchor}-${code.replace('.', '-')}"><td class="code">${code}</td><td>${text}</td></tr>`
  })
  .join('\n')}
</tbody></table>`
    return `<h2 id="${ref.anchor}">${esc(ref.name[lang])}</h2>
<h3>${t('G codes', 'Códigos G')}</h3>
${table('g', Object.entries(control.gCodes))}
<h3>${t('M codes', 'Códigos M')}</h3>
${table('m', Object.entries(control.mCodes))}`
  })
  const body = `
<section>
  <h1>${t('G-code and M-code reference: Fanuc lathe and mill, Haas', 'Códigos G e M: torno e centro de usinagem Fanuc, Haas')}</h1>
  <p class="lead" style="margin-left:0">${t(
    'What each G and M code does on each control, as CNC Simulator runs it. The same explanations appear in the app’s learning mode when you hover a code in the program.',
    'O que cada código G e M faz em cada comando, como o CNC Simulator executa. As mesmas explicações aparecem no modo aprender do app, ao passar o mouse sobre um código no programa.'
  )}</p>
  <div class="toc">${REFERENCE.map((ref) => `<a class="btn" href="#${ref.anchor}">${esc(ref.name[lang])}</a>`).join('')}</div>
  <p><a class="btn primary" href="${relative(PAGES.codes[lang], PAGES.home[lang])}#download">${t('Try the codes in the free simulator', 'Teste os códigos no simulador grátis')}</a></p>
</section>
${sections.join('\n')}
`
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: t('G-code and M-code reference: Fanuc lathe and mill, Haas', 'Códigos G e M: torno e centro de usinagem Fanuc, Haas'),
      inLanguage: htmlLang[lang],
      dateModified: today,
      url: `${SITE}${PAGES.codes[lang]}`,
      author: { '@type': 'Person', name: 'Ismael Figueiredo' },
      isPartOf: { '@type': 'WebSite', name: 'CNC Simulator', url: `${SITE}/` }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'CNC Simulator', item: `${SITE}${PAGES.home[lang]}` },
        { '@type': 'ListItem', position: 2, name: t('G-code reference', 'Códigos G e M'), item: `${SITE}${PAGES.codes[lang]}` }
      ]
    }
  ]
  return layout({
    lang,
    page: 'codes',
    title: t('G-code list with explanations: Fanuc lathe, Fanuc mill and Haas | CNC Simulator', 'Lista de códigos G e M com explicação: torno Fanuc, centro Fanuc e Haas | CNC Simulator'),
    description: t(
      'Every G and M code of the Fanuc 0i-TF lathe, Fanuc 0i-MF machining center and Haas NGC mill, with what it does: G71, G76, G41, G43, G154, M97 and more.',
      'Todos os códigos G e M do torno Fanuc 0i-TF, do centro de usinagem Fanuc 0i-MF e da fresadora Haas NGC, com o que cada um faz: G71, G76, G41, G43, G154, M97 e outros.'
    ),
    body,
    data
  })
}

function write(path: string, text: string) {
  const file = join(root, 'docs', path, path.endsWith('.xml') || path.endsWith('.txt') ? '' : 'index.html')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
  process.stdout.write(`docs${path}${path.endsWith('/') ? 'index.html' : ''}\n`)
}

for (const lang of ['en', 'pt'] as const) {
  write(PAGES.home[lang], home(lang))
  write(PAGES.codes[lang], codes(lang))
}
// The app's icon and favicon, served by the site itself
mkdirSync(join(root, 'docs/img'), { recursive: true })
copyFileSync(join(root, 'src/renderer/public/favicon.png'), join(root, 'docs/img/favicon.png'))
copyFileSync(join(root, 'src/renderer/public/icon.png'), join(root, 'docs/img/icon.png'))
// The brand's condensed face, served by the site (no third-party font requests)
mkdirSync(join(root, 'docs/fonts'), { recursive: true })
for (const w of [600, 700]) copyFileSync(join(root, `node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-${w}-normal.woff2`), join(root, `docs/fonts/barlow-condensed-${w}.woff2`))
const urls = (Object.keys(PAGES) as PageId[]).flatMap((page) =>
  (['en', 'pt'] as const).map(
    (lang) => `  <url>
    <loc>${SITE}${PAGES[page][lang]}</loc>
    <lastmod>${today}</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${PAGES[page].en}"/>
    <xhtml:link rel="alternate" hreflang="pt-BR" href="${SITE}${PAGES[page].pt}"/>
  </url>`
  )
)
write('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`)
