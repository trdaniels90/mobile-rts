'use strict';
// Terrain painting, sprite drawing, effects and sidebar cameos. Units, structures and scenery
// come from the voxel models in models.js; this file puts them on screen.

// The last frame's drawing time by part (ms) and how many trees, units and effects it drew: set by ui.js draw, read by
// the match report (report.js noteFrame) for each minute's average and its slowest drawing frame.
const drawParts = { gnd: 0, list: 0, tree: 0, bld: 0, unit: 0, misc: 0, edge: 0, fx: 0, air: 0, bars: 0, blit: 0, night: 0, wthr: 0, nTree: 0, nUnit: 0, nFx: 0 };
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// HD graphics (owner, 2026-11-25: "go ahead ... as an HD option"; looks only, both modes). Off: the game as before. On (menu
// Options, localStorage rh-hd; ?hd=1 / ?hd=0 for one load), with WebGL only: the frame is drawn at HD.K times the world's
// pixels (gl.js R.rs) and the sprites come from sprites-hd/ (tools/bake-sprites.js --hd: the models built at 4x detail, the
// pictures at 2x, soft shadows); what is not baked is rendered live at 2x (hdSprite below). A picture with _k > 1 holds
// _k pixels per world pixel and is always drawn at its world size (hdArgs): code that places pictures keeps world units.
const HD = (() => {
  const q = typeof location !== 'undefined' ? location.search : '';
  let pref = false;
  try { pref = typeof localStorage !== 'undefined' && localStorage.getItem('rh-hd') === '1'; } catch (_) {}
  if (/[?&]hd=1\b/.test(q)) pref = true;
  if (/[?&]hd=0\b/.test(q)) pref = false;
  const gl2 = typeof WebGL2RenderingContext !== 'undefined' && !/[?&]gl=off\b/.test(q) && !(typeof HEADLESS !== 'undefined' && HEADLESS);
  // HD ground (owner, 2026-11-25: full 2x ground, computers first, phones behind a switch to try): the ground's tiles
  // painted at HD.K pixels per world pixel. On by default on a computer, off on a phone or tablet (memory: four times
  // the ground); Options "HD ground" (rh-hd-ground '1' / '0'), ?hdground=1 / 0 for one load. Only with HD on.
  const phone = typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || /iPhone|iPad|iPod|Android/.test(navigator.userAgent));
  let gp = null;
  try { gp = typeof localStorage !== 'undefined' ? localStorage.getItem('rh-hd-ground') : null; } catch (_) {}
  let ground = gp === '1' ? true : gp === '0' ? false : !phone;
  if (/[?&]hdground=1\b/.test(q)) ground = true;
  if (/[?&]hdground=0\b/.test(q)) ground = false;
  return { K: 2, pref, on: pref && gl2, phone, groundPref: ground, ground: pref && gl2 && ground };
})();
// The ground's pixels per world pixel (HD ground: HD.K), and how much of the half-size grass blades HD ground mixes in.
const GK = HD.ground ? HD.K : 1, HD_FINE = 0.3;
// The frame's pixels per view pixel: 1, or HD.K while WebGL draws an HD frame (gl.js sets it; the 2D way keeps 1).
let FRAME_RS = 1;
const frameRound = (v) => (FRAME_RS > 1 ? Math.round(v * FRAME_RS) / FRAME_RS : Math.round(v));
// drawImage's arguments for a picture of _k pixels per world pixel, so it covers its world size: (x, y) gets the size,
// a source rectangle (given in world pixels, as for any sprite) is scaled to the picture's own.
function hdArgs(img, a) {
  const k = img._k, n = a.length;
  if (n === 2) return [a[0], a[1], img.width / k, img.height / k];
  if (n === 8) return [a[0] * k, a[1] * k, a[2] * k, a[3] * k, a[4], a[5], a[6], a[7]];
  return a;
}
// The world-size height and width of a sprite's picture.
const picW = (img) => img.width / (img._k || 1), picH = (img) => img.height / (img._k || 1);
// A picture at one pixel per world pixel (for what is painted into the ground, which is at that size): HD ones made smaller once.
const sdMemo = new WeakMap();
function sdPic(img) {
  if (!img || !(img._k > 1)) return img;
  let c = sdMemo.get(img);
  if (!c) {
    c = mkCanvas(Math.max(1, Math.round(picW(img))), Math.max(1, Math.round(picH(img))));
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
    if (img._ox !== undefined) { c._ox = img._ox; c._oy = img._oy; }
    sdMemo.set(img, c);
  }
  return c;
}
// A cast shadow's mask softened (HD): blurred by about a world pixel, its edge fading instead of stepping.
function softShadow(c, k) {
  const P = Math.ceil(k * 1.5), o = mkCanvas(c.width + 2 * P, c.height + 2 * P), g = o.getContext('2d');
  g.filter = `blur(${(k * 0.75).toFixed(2)}px)`; g.drawImage(c, P, P); g.filter = 'none';
  o._pad = P;
  return o;
}

// The iso view (voxel.js VIEW): the battle is drawn on a context whose transform takes world coordinates to the
// turned, squashed view plane, which is right for the ground and everything lying on it. A sprite must stand upright,
// so uprightCtx(g) makes g draw any rendered sprite (a picture with _ox / _oy, set by renderVox and SpriteSheets)
// untransformed, with its origin at the screen spot its world origin projects to. While g.upright is set (units,
// effects, bars: everything that stands up), every other picture (stood at its middle), rectangle (pixels, bars,
// tracers) and label is placed the same way. Lines, arcs and outlines stay on the ground.
function uprightCtx(g) {
  if (g._upright) return g;
  g._upright = true; g.upright = false;
  const P = CanvasRenderingContext2D.prototype, di = P.drawImage, fr = P.fillRect, ft = P.fillText;
  // Only the transform changes for the one draw, so it alone is put back: a full save() / restore() for every
  // sprite, effect pixel and label was a quarter to two fifths of a big fight's frame on a large screen.
  // g._px (a picture painted into HD ground, standOnGround): the canvas holds _px pixels per world pixel, so an upright
  // draw is made at that scale (spots worked out in its pixels, then divided back), not at one pixel per pixel.
  g.drawImage = function (img, ...a) {
    const PX = g._px || 1;
    if (img && img._k > 1) {   // (HD: drawn at its world size)
      if (a.length === 8 && img._ox !== undefined) {   // (a part of a sprite: anchored by the source rectangle in world pixels)
        const b = hdArgs(img, a), m = g.getTransform(), ax = a[4] - img._ox - a[0], ay = a[5] - img._oy - a[1];
        b[4] = frameRound(m.a * ax + m.c * ay + m.e + a[4] * PX - ax * PX) / PX; b[5] = frameRound(m.b * ax + m.d * ay + m.f + a[5] * PX - ay * PX) / PX;
        g.setTransform(PX, 0, 0, PX, 0, 0); di.call(g, img, ...b); g.setTransform(m);
        return;
      }
      a = hdArgs(img, a);
    }
    const sprite = img && img._ox !== undefined;
    if (!sprite && !g.upright) return di.call(g, img, ...a);
    const n = a.length, j = n === 8 ? 4 : 0, dx = a[j], dy = a[j + 1];
    const w = n === 2 ? img.width : a[j + 2], h = n === 2 ? img.height : a[j + 3];
    // The anchor: a sprite's origin (allowing for a part cut from the source, as a structure rising from its pad),
    // anything else's middle.
    const ax = sprite ? dx - img._ox - (n === 8 ? a[0] : 0) : dx + w / 2, ay = sprite ? dy - img._oy - (n === 8 ? a[1] : 0) : dy + h / 2;
    const m = g.getTransform(), b = a.slice();
    b[j] = Math.round(m.a * ax + m.c * ay + m.e + (dx - ax) * PX) / PX; b[j + 1] = Math.round(m.b * ax + m.d * ay + m.f + (dy - ay) * PX) / PX;
    g.setTransform(PX, 0, 0, PX, 0, 0); di.call(g, img, ...b); g.setTransform(m);
  };
  g.fillRect = function (x, y, w, h) {
    if (!g.upright) return fr.call(g, x, y, w, h);
    const PX = g._px || 1, m = g.getTransform(), cx = x + w / 2, cy = y + h / 2;
    g.setTransform(PX, 0, 0, PX, 0, 0); fr.call(g, Math.round(m.a * cx + m.c * cy + m.e - w / 2 * PX) / PX, Math.round(m.b * cx + m.d * cy + m.f - h / 2 * PX) / PX, w, h); g.setTransform(m);
  };
  g.fillText = function (t, x, y, ...m) {
    if (!g.upright) return ft.call(g, t, x, y, ...m);
    const M = g.getTransform();
    g.setTransform(1, 0, 0, 1, 0, 0); ft.call(g, t, M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f, ...m); g.setTransform(M);
  };
  return g;
}

// Draws a pre-rendered sprite (and its cast shadow) with its origin at world (x, y).
// In the battle view (uprightCtx, g.upright) the picture is placed by rounding its spot once, on the screen. It used to be
// rounded on the map first (here) and again on the screen (uprightCtx), and a tank's hull and turret, each rounded twice on
// their own, slipped a pixel against each other as it drove (the turret seemed loose, the tank to jolt; at zoom 2 two screen
// pixels). on: the spot another picture was drawn at (what blit returns), so this one keeps a whole-pixel offset from it.
function blit(g, s, x, y, shadow, on) {
  if (g.upright && g._upright) {
    const m = g.getTransform(), X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
    const R = frameRound, px = on ? on[0] + R(X - on[2]) : R(X), py = on ? on[1] + R(Y - on[3]) : R(Y);
    g.upright = false; g.setTransform(1, 0, 0, 1, 0, 0);
    if (shadow !== false && s.sh) { g.globalAlpha = 0.45; g.drawImage(s.sh, px + R(s.sox), py + R(s.soy)); g.globalAlpha = 1; }
    g.drawImage(s.img, px + R(s.ox), py + R(s.oy));
    g.setTransform(m); g.upright = true;
    return [px, py, X, Y];
  }
  if (shadow !== false && s.sh) {
    g.globalAlpha = 0.45;
    g.drawImage(s.sh, Math.round(x + s.sox), Math.round(y + s.soy));
    g.globalAlpha = 1;
  }
  g.drawImage(s.img, Math.round(x + s.ox), Math.round(y + s.oy));
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
const TERRAIN_MINI = ['#2f3d23', '#5a4c37', '#1c2a14', '#5e5a52', '#4a6a8a', '#6b5a3e'];
const TERRAIN_MINI_SNOW = ['#c9d1dd', '#8c8782', '#2a3d30', '#62646c', '#34506c', '#9a9ca0'];   // (bridges: concrete grey)
// The minimap colours of the map being played; snowy() is true on a winter map.
const snowy = () => !!(G && mapTheme(G.mapId) === 'snow');
const terrainMini = () => (snowy() ? TERRAIN_MINI_SNOW : TERRAIN_MINI);

// BLENDER:grass begin
const GRASS_TILE = '3604566691156946956972323324955082125125930058373887603784047320550081557326588436896233766804042876101636203587889744310775003216454276855425452494735231114527853610127226687427476045573514013703615754945999897416207964362386588349997346968462042322485450023673259400113436222524301116941117011532575742065380255256320063126877655287998474831165067210863024652227477269301303426588511485611594320397411115204506140111251117245856205686432814677200151012134208856321602785547266117350024532247576883315627597268244572775856001153020441370226221051271082304640255570158453742120663156452675196303217733354440597500115747566424840039528977585885363497461111666356017775688410486263744066452756630152768755007165377378920596011115775634605974120462483940086320178647986697233777544200127648664013453497799435664074374434952441516669942392754678869026452111124812005269241535006947631665104572013145959998741343563881447788769445747420153954653876569215240743977777885584871772592202011519762023195534400186842642954662563400074362426602412115414158516796068411101667560356244868550124542505468977066678867701240552158778875964455104746440366667014757317652726438667003047325625569440445204596534359763219774930043023198637554725692668202315210028159888100423156040553414622369452038337965995692326224277755441423555028512169941113889636600430011268568977838706467330043511280059557141208874455698630111398500285868976874634457413888574112102795634421780430599747899215310044672333061487784678520164543402139638472586777321789504123854144489963038864593389459763523567834265250579012605343566183024735453602641103671451537430654062040378667452762321015598810424441374727652584102827897572395131024655860630661538862446979641438723346303602216585122569565400455030257515476700421437644101221554695887449606300062823146599500136044731732084219667757701336384252872957000052644404267666531163426772240238022866881630025406706388896579639631355017501717403437434158963131372379482414353461268655247242598765648675078717899921111503295595233598504318868850603344538990220634343198741123465438995896573542298436241475416895536655007728013013441685334111011741866998594564885001267298361532231174635505656840464011248751188270333497720783175032943124947267154436664001978361878763243165385654764741018965610888626666230011146570233864516435402249716552140055333301867832637007984470476365525673432084005370284545102791025663760084964025379997533300310214713655083226980053475569344501397102210635824157455676688560350356811277750584612846043014886437954374643441352487476543244000138516404870310664689816473540147850068646423496687842462445747331059210327874056347800351377466356500899408045105629633656799886786211028651031665529548855005678443336043154504554364445039863100449786977111048188446847029524576763474380454466377356030205122753401359789824327078791146545862863554165544092276602474776540110581356743335268422354665633307426414467673401468247852465140016251464366628627284540997001353515124721461633837847336563575677739622336594214770355736643642353266600866431115754668435486501176525476205764461394305275455415460506400251322363797533602441177280414247711159762735225568456062757345799201546001577487675212345687854489951474662400777431247434616129975504045002756755364819321537025589985013814013559807646474179387242447100681199587460116493015979700598886011725115563474351149747653555550337533645481302226423446877745833242790411352675595554324167205777940499742445303444029530492184045362007369511311688787614413468832005623151355875054767625336940015611200635877772667553630230295656802412545257542042237338766206286061157511471384245460029893601115645726641663172767155799801129657425466552670110177100620332512113543560835564247860185677550084501565413303461158321622960011161325713436622255914579511355361357777768967500126486456467677424521472302325898386777642238710155027203264225453764694014620101962374269956764477489496346624661664857872643234663840050526697842965851043025685726524640564124237683225565374595328699797403105956386623759588938752706677320888734588601005602768251448654564666959610560001443121854466257340457912487789466366641139966182043801626532138361068544146854131825532687555181132284004276164043232647547541034720532686651003213488566899282702845100008321840922679437115344151964265847574038264787973035124663891153556801674101436682045052665318821395454869532413343536071235762376326748155778964147510763867200052700134573656000512734687628730398405767210146863460457314555220521124771064605604457687545221572049576478968237359326469666345736303255987679316013506362295116954635652301363487230201202697425832697536624741630650101123564329590046505756520265347664012554464403861774249572543461025790627032664854046474446953533456524987977754136777464208500012333474778674505568324675452274212204620375496337494012873267201389941460285005381514387703726268999649583841289793346576272530022653368893345237663242302139895035157775446227747774115274224100448730246782078679674669037475373604055116173229936574661703351457413568376289633530123224464232078779345820398414750577502454311413794691720566331867428234626921069636644085478769999686230114484362136195572689001156013114221979981065018852352455956567733147352566315313346768061772245877899864866202397462189379843300233834512083393243382014834777742445775977085401970000278684782114763633652772204244874566577899858405416665315770479999624994202549757241530640245603786259762610527849540761005663111774348200659855546009966357157325869656887555063134040295413479486305963016182042357432611665027773455124103145388027541151133173841229362396953775748132364854208544567787736854081254449965995783027311577702531271055142931899005703053142141393255442424346439877138974669944633534194578936470487970527047460376874146888750412253490977565015312805117422649464625654603023850313788510278561815273745999876735061389677993679767695733885351471126173515778334498402374240156553142478543002501417757310304504505999679988446064325632497305553241455468776877975872559257367635173464051384480056651514221620111143348930032010139675385434160066247338267740332267017153342225557315930335359635721265357520172543336524378673820004426621013220111886151274301153069703544405576221260464456702554801123153283692039505114166735310245873342706841336555825259521045166100169333259131254396150077873646805147437336136233165536410010353130789361588756513457297201278994177446564855238989844360250363110272033628400251485385599504799659766720256841166406634201157511359940656966578462447797412799520739795269303476176435601401527220550515623311575311516464440059727888201158434784074223015951401388577846165670334059911111997335535544890037616585577554214781772115435310014165457064152231025437061011167655866767352057470141799885414388401432733301179558622214487705965557128385454556952385518553573431344860731717500001640520112551176896360254855400361798445454742052313014120657401115324654582253617254260001119620254478611070041122883843169821316216405041037950773414626554012874966838588611736034145663047502417999956996684448213455201264513213590633712731273352455569753350264160341648358166655678998775776446662443637950465534431541863366046885663445268693336556645521526812862038779976968262165524512552775129883614835564465895365624072430144393703754011541439351754339997510517873251253366519003745277122735974733071455250141816125001560141490301770667643995433563750150283202523215301115609856049814646789166626584112787115340165225377997356325014557445273250017055036443017874156124774624227457202465536001530013276437650079887554779866984951007980176500550313776826724420468677217457101465521202803379557146432658360035493477562636017101421944698542174652146022142389784455531288011930011697871583173676453185640379778435239537957175301354736532166623465609543823110133055599752559865474221330476986753130844305943357247539327656999963577995960687368962598031164003502685257782328588867556015201713523556539987133542646205233223963404772137214436892481181430188204111372107265357105940211486753012971016653269644668510226016308003520067553253546340270336642616426733112561249203266138201436500114534883571530157610223616410038830345421677200427301550754099887113631699003154502443101027434427061232601473310294647568385321015579636215231687844266271424798685765476672002180048667945939975535739875545964313533311445303474422477211876550697284471335211156323958863342184653520836477521810138557630416303796464588734862413714648842366123000006555422451220033138578795752475732661334420232673106766785148004433374437556564554415250033163351046626385200555587133628864211154779103777500131157771596621699710931172233334817301474455922154610163636694363688550673400631531252491254303711545255343101115567573241247731810395747687970025518533885423256336417424349198985000239973111413457604775026237989755944554276143461705531012256943437452064046524317751853453140046678945622124673265642462965731123388001523730556586461256561135986401746344676654323840141446123360674355658620114668076465710065772775454347863241335628942010602672175897000536253461423465364751208351157312444231836155696531514800544678600235685621006766784676498401394101375762368245642236899779716525354232421658461122264476311484342128156548440514832136454261134554589952245993026233552124103920047404945661898649599857954133950655453105863116111853350012384364833382770402001211455479201166863085620397464512600600251176111227037645254275561138345974793122430230142102270352926511148963464407557718873140647201680311245730740148131602439763405411112443476357546289656101246897964801331795433321254645217630560167656266663437333369515994722735765832507357791302134747114963500019356656604678762370116678987566263302343501169964432449464600397678852286986451499235916046052232712063554564204731386101956311470125794343267913300161275446246463132657543339585204464417596564463252465800423227554641675110151821604213554511455463746789687633033352472218354001910365305693402168755734484855778856596455455260483285011410174405565782204204527002326764528411547744677996128602521434565345479644682678468331533542666749104312136967105798777335902553632074051646692062013564435565640620231196501426584416454530201414573484797405873273501503447695657651343468860678556046164681445873454954868220412123477373404613221466653553000174556436900583621789840294069406659958134386755533867657149983122572271387503043654219716462434101405378893018564302725303872001495758639204478546073710756960026477534851976815545342260139820464454413018623533874234896300430016033957551125754656473106831026643201175425551550529746466443243433213656344066734279735398305657996573172452431658304173027325773357885600026345033755105730418041012649610367313258832553540125241139634245795562469674437862469643687312145149106043701466357556133248521164564101878637600382457677737215534556425675725511360011188573388934816419955263736642445722310654743332489620341115683542118170477248532016693246611203654454454612634467074981546421048349564666357441294576319362343146123537692555444793301353385833600255522455252769957827564560428246710031744997879574543291021450476182472977312686413574806311771377229300323359567753735704384024588867677123112574461726207343366630245864179997225644530340676574565605652431467538331743235864374585300541580261238588989753273343886984210377774169950353011769702947621766685238777643533561543576101620023896787338346548745534931013300421201661897615179851015823732571341953683320050129076569161300452433821874445589841645225177638776579864474131144477544601132030794056701783641212520212750012897236224255131210460465799835145402359431735574588954792215256378367654743336765788770055006763554004648768036002140134401810174665430432015053433245328594142585205937117147849925404836546768301011393817235189743550535111699541127267163430498621283213740349966206233142698985575354652255465625356535447139803073568789758414131475742234895061404031118680003321688652336425106403303701481042072040669988993875076245652675755513151454798330559557684696337259532376466877257433440263557554124277260279987291362209006899993773514533036905769273378676467223230433113939125995677885987435950302202425534423594586787644041597989753311725607237162076387999513303041359232824756045753761144002500127466189483608989564586688112517000540129852242059750535417735634677323297676460169823372125111446996601796231222644167682007011122557694904174694426401751345737468221492685410395355524035630013150051560284737763420321152532641654319569652466636787421681001125197108501659643670046321584065656249766985109730357700114101442300435643558773124110433217303156556618763241825064002338967157230522069523485723644142059872689645974468456154014566210175172285314761233470143151043292695558476156182647007221644443316664458654172049865585415247612695063655098411154743833007045142542896874224111365613435710854489996444851686756710043044844577773010339973583174539375042183682783043674851111445239576778777140615894558443405811840657576022996656306765699545602822445163279551162089770183636683495142401418585453653111132526560410364400555287853457843056127329799749274515696225863561043002654131152195739745833130076252650254761222055338455102322346532623637496415035501254348662367643732686779763542976221211653731112765025651489974095481451423664688534788535553273542145008768046435876552998593100044496444610266522238648612439085401147236520105462106465764677838711370005754397742601227522364421171453647934346256751250752612745861667610167440254339642480642012162067411045541700167635657810203654343019472455227498836058410632316125564672077943504780137447814044563463620133298511508520220230534510445674543322899379304165444174661603761575116240152868320022151312569668776385151388626406253667237305410370603269833200242434435432318530435680769223866430678849835567565687738862788510011444065250178753200425174575656676516498783315937586622976370376134647412297441378771544757467414638695433013783736503316205700314464340300566963141526796517009526217625451395205989549678983451378146248430102434836407749310341279576312797667970021070451042166997768124465145687620562675170474026117926964531776962648542610778598999811033174286124484623435930122499212598876478505154224630102460575830032785633014314837130186046267211332678401395105117536235968376736744464297120343269300021525654111451678570553423444355737736301137990462425265532102667434030300214493015764211474384159246747763332073498422975482044313111876411463384405767104028177718221011499902575385245434554253733106051121750548774105467765553191175620026747775479997553885113578766328976178468860130998732265211333799997735771040247456008142466025962854578634546826427895533323676575619027875446623346434034668267753243677302555164445564263226241469357667705578200071332721269569746554977644943060699699400131930342258687726743036414899992359412159997831305974698613445641551733794688886578101668743564677895578517874536126237769553214538664023393595999762376453324500547353745735336337996603360244373118375497762551558204797630615665957820123634560152265863101124672283143959699694156797680065521797684425840046784674251187842323720386604586769982034103826672386315433474156316470522740001244887864257864662903577831751779754421465355500513976152510468650661049886598257563664452542827557764026234240781458997346810111147504972425153629027665530601276965013766716799557834336059765016720465412501783346742654246995125820284644525598106986548530000546265550142536167543338554304556802417423787955459463630397537622201770012114466551634474652354202827501145456856244500597381003365698501305332386134896455254575079659324681165667215522496557202125863012233523477932527123041476642023263894145254025538984772775651331052316602264793278954098995565536540483562365201715578233159864213466683326437754420036304801341595441065203617896915559251240410558647710816621063430179552225464556206712740055576555448775573032593544516868407102276234124361495970782052760689862984203544028728057028103720589455292324635554740267758301548235320231763765534793882089568862433966732256748677426999212734486716501145589757735603195544302671279866557574434997847971641492227934281102735323999547731127647411708534729934539536624442540374531000679975999054420907767101767535254166353601377499787264596745885461177443353148631134';
const GRASS_TILE_N = 128;
// BLENDER:grass end
// The pixels of the ground for one map, before bridges and scenery: pixels(d, x0, y0, w, h) works out that part of
// the ground (world pixels) into d (RGBA). Plain arithmetic on the map's arrays, no canvas, so it also runs in the
// ground workers (groundWorkers); everything it uses must be listed there. Every pixel depends only on where it is.
// The whole-map preparation (noise, cliff cells) is done once, at the first call.
// theme: 'snow' paints winter: snow for grass, slush for dirt, icy shores, cold water, snowy ridges.
// mesas: a map's mesas as mesaTops gives them (Lakeside): no rock, scree or ridge shadow is painted on their level top.
function groundPixels(terr, seed, roads, cliffs, fords, theme, hgt, mesas) {
  const snow = theme === 'snow', marsh = theme === 'marsh';
  // A 256-colour era look: a handful of tones per surface, picked with dithered noise.
  // Winter: snow in cold blue shades, the tracks trodden to grey slush, frosted stony shores, dark icy water.
  // Fen (marsh): olive grass, dark peaty mud, murky green-brown water, and its shallows (fords) weed and mud, not stones.
  const GRASS = snow ? [[156, 166, 184], [178, 188, 204], [198, 207, 220], [216, 223, 233], [234, 239, 246]] : marsh ? [[34, 40, 24], [42, 50, 28], [52, 60, 32], [62, 69, 38], [78, 82, 46]] : [[30, 40, 24], [38, 50, 29], [46, 60, 34], [56, 70, 40], [70, 84, 48]];
  const EARTH = snow ? [[98, 94, 92], [116, 112, 108], [134, 130, 126], [152, 150, 148]] : marsh ? [[48, 40, 30], [60, 50, 36], [72, 61, 44], [86, 73, 52]] : [[66, 55, 39], [80, 67, 47], [96, 81, 57], [112, 95, 67]];
  const SANDS = snow ? [[142, 148, 158], [162, 168, 178], [182, 189, 199]] : marsh ? [[78, 72, 52], [92, 85, 61], [106, 98, 70]] : [[124, 111, 82], [140, 126, 94], [156, 142, 108]];
  const WATER = snow ? [[30, 48, 68], [38, 58, 80], [48, 70, 94], [60, 84, 108]] : marsh ? [[30, 42, 38], [36, 50, 44], [44, 59, 50], [54, 69, 58]] : [[52, 80, 108], [62, 92, 122], [74, 106, 138], [90, 122, 154]];
  const STROKE = snow ? 0.5 : 0.95;
  const SOFT = typeof LOOK_SOFT !== 'undefined' && LOOK_SOFT;   // (look.js test; in the workers, from their constants line)   // snow shows the blade tile only as soft wind ripples
  const pickTone = (pal, v) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))];
  const sm = (t) => t * t * (3 - 2 * t);
  const seedH = Math.imul(seed | 0, 1442695041);
  const speck = (x, y) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seedH; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  let P = null;   // the whole-map preparation
  function prepare() {
    const r = rng(seed);
    // Cell-centre fields, sampled bilinearly so dirt and shorelines blend across cells.
    const dirt = new Float32Array(NCELLS), water = new Float32Array(NCELLS);
    const ford = new Float32Array(NCELLS);   // shallow fords (fixed-layout maps): a stony creek bed under clear water
    for (let i = 0; i < NCELLS; i++) { dirt[i] = terr[i] === 1 ? 1 : 0; water[i] = terr[i] >= 4 ? 1 : 0; ford[i] = fords && fords[i] ? 1 : 0; }
    const nearFlag = new Uint8Array(NCELLS);
    for (let cy = 0; cy < MAP; cy++) for (let cx = 0; cx < MAP; cx++) {
      let f = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const x = cx + ox, y = cy + oy;
        if (x < 0 || y < 0 || x >= MAP || y >= MAP) continue;
        if (dirt[y * MAP + x]) f |= 1;
        if (water[y * MAP + x]) f |= 2;
        if (ford[y * MAP + x]) f |= 4;
      }
      nearFlag[cy * MAP + cx] = f;
    }
    const grid = (s) => { const w = Math.ceil(WORLD / s) + 2, a = new Float32Array(w * w); for (let i = 0; i < a.length; i++) a[i] = r(); return { a, w, s }; };
    const N1 = grid(10), N2 = grid(40), N3 = grid(160);
    P = { dirt, water, ford, nearFlag, N1, N2, N3, cliff: cliffs ? cliffCells(terr, cliffs) : null,
      tile: Uint8Array.from(GRASS_TILE, (c) => c.charCodeAt(0) - 48) };   // grass tone values 0-9; the size is a power of two
  }
  function noise(N, x, y) {
    const fx = x / N.s, fy = y / N.s, x0 = fx | 0, y0 = fy | 0, w = N.w, a = N.a;
    const tx = sm(fx - x0), ty = sm(fy - y0);
    const p = a[y0 * w + x0], q = a[y0 * w + x0 + 1], s = a[(y0 + 1) * w + x0], t = a[(y0 + 1) * w + x0 + 1];
    return (p + (q - p) * tx) * (1 - ty) + (s + (t - s) * tx) * ty;
  }
  function bil(arr, fx, fy) {
    const x0 = Math.max(0, Math.min(MAP - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(MAP - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const a = arr[y0 * MAP + x0], b = arr[y0 * MAP + x0 + 1], cc = arr[(y0 + 1) * MAP + x0], dd = arr[(y0 + 1) * MAP + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (cc + (dd - cc) * tx) * ty;
  }
  // The grass tile between its pixels (HD ground): column u, row v, in world pixels.
  function tileAt(u, v) {
    const TM = GRASS_TILE_N - 1, tile = P.tile, u0 = Math.floor(u), v0 = Math.floor(v), a = u - u0, b = v - v0;
    const r0 = (v0 & TM) * GRASS_TILE_N, r1 = ((v0 + 1) & TM) * GRASS_TILE_N, c0 = u0 & TM, c1 = (u0 + 1) & TM;
    return (tile[r0 + c0] * (1 - a) + tile[r0 + c1] * a) * (1 - b) + (tile[r1 + c0] * (1 - a) + tile[r1 + c1] * a) * b;
  }
  // Paints world pixels (X0, Y0, w x h) into d, RGBA w x h. K (HD ground): K x K pixels per world pixel, d (w K) x (h K);
  // everything smooth is sampled at each small pixel's middle (x, y: world, fractional) and the grain (speck, the grass
  // blades, crests) is worked out on the fine grid (xi, yi), so the ground gets finer detail, not bigger blocks. K 1: as before.
  function pixels(d, X0, Y0, w, h, K = 1) {
    if (!P) prepare();
    const { dirt, water, ford, nearFlag, N1, N2, N3, tile } = P, TM = GRASS_TILE_N - 1;
    let p = 0;
    for (let yi = Y0 * K; yi < (Y0 + h) * K; yi++) {
      const y = K === 1 ? yi : (yi + 0.5) / K - 0.5, fy = y / CELL - 0.5;
      for (let xi = X0 * K; xi < (X0 + w) * K; xi++, p += 4) {
        const x = K === 1 ? xi : (xi + 0.5) / K - 0.5, fx = x / CELL - 0.5;
        const n3 = noise(N3, x, y), hh = noise(N1, x, y) * 0.35 + noise(N2, x, y) * 0.45 + n3 * 0.2;
        const sp = speck(xi, yi);
        // Grass: the Blender blade tile gives the strokes. Two lookups (the second turned on its side and shifted)
        // are mixed by slow noise, so the 128-pixel repeat does not show. (HD: the blades between the tile's pixels, their
        // contrast put back (smoothing them flattened it), and a finer copy of the tile, half size, mixed in for small blades.)
        const ms = Math.max(0, Math.min(1, (n3 - 0.4) / 0.2));
        let gt;
        if (K === 1) { const tA = tile[(y & TM) * GRASS_TILE_N + (x & TM)], tB = tile[((x + 53) & TM) * GRASS_TILE_N + ((y + 29) & TM)]; gt = (tA + (tB - tA) * ms) / 9; }
        else {
          const tA = (tileAt(x, y) - 4.5) * 1.7 + 4.5, tB = (tileAt(y + 29, x + 53) - 4.5) * 1.7 + 4.5, fA = tile[((yi + 71) & TM) * GRASS_TILE_N + ((xi + 17) & TM)];
          gt = ((tA + (tB - tA) * ms) * (1 - HD_FINE) + fA * HD_FINE) / 9;
        }
        let col = pickTone(GRASS, hh * 1.1 - 0.12 + (gt - 0.5) * STROKE + (sp - 0.5) * 0.1);
        if (sp > 0.992) col = GRASS[4];
        const near = nearFlag[Math.min(MAP - 1, Math.max(0, Math.round(fy))) * MAP + Math.min(MAP - 1, Math.max(0, Math.round(fx)))];
        const dv = near & 1 ? bil(dirt, fx, fy) + (hh - 0.5) * 0.3 + (sp - 0.5) * (SOFT ? 0.03 : 0.12) : 0;
        if (SOFT && dv > 0.3) {   // (look.js test: grass fades into dirt over a band, worn and darker at the edge)
          const e = pickTone(EARTH, hh * 1.2 - 0.1 + (sp - 0.5) * 0.6), k = sm(Math.min(1, (dv - 0.3) / 0.2)), wear = 1 - 0.18 * Math.sin(k * Math.PI);
          col = [(col[0] + (e[0] - col[0]) * k) * wear, (col[1] + (e[1] - col[1]) * k) * wear, (col[2] + (e[2] - col[2]) * k) * wear];
        } else if (!SOFT && dv > 0.42) col = pickTone(EARTH, hh * 1.2 - 0.1 + (sp - 0.5) * 0.6);
        const wv = near & 2 ? bil(water, fx, fy) + (hh - 0.5) * 0.22 : 0;
        if (wv > 0.5) {
          const crest = ((xi * 3 + yi * 7 + Math.floor(noise(N1, (x * 3) % WORLD, y) * 30 * K)) % (23 * K) === 0) && sp > 0.4;
          col = crest ? (snow ? [70, 94, 118] : marsh ? [84, 98, 86] : [150, 172, 190]) : pickTone(WATER, 0.9 - (wv - 0.5) * 1.6 + (hh - 0.5) * 0.5 + (sp - 0.5) * 0.4);
          if (wv < 0.545) col = marsh ? (sp > 0.35 ? [74, 70, 50] : [58, 56, 40]) : sp > 0.35 ? [178, 192, 198] : [120, 140, 156];   // surf (a fen: a muddy rim)
          if (snow && wv < 0.6 + (hh - 0.5) * 0.25) col = sp > 0.25 ? [206, 222, 234] : [168, 190, 208];   // shelf ice along the shore
          const fv = near & 4 ? bil(ford, fx, fy) + (noise(N1, x, y) - 0.5) * 1.6 + (noise(N2, x, y) - 0.5) * 1.0 : 0;   // a ragged edge
          if (fv > 0.3 && marsh) {   // the fen's shallows: peaty mud under brown water, weed and duckweed, reeds standing in it
            const k = Math.min(1, (fv - 0.3) / 0.12), wn = noise(N1, x, y) * 0.6 + noise(N2, x, y) * 0.4;
            let sh = pickTone([[44, 50, 36], [52, 58, 40], [60, 66, 44], [70, 74, 48]], wn * 1.3 - 0.15 + (sp - 0.5) * 0.35);
            if (wn > 0.58 && sp > 0.55) sh = sp > 0.85 ? [96, 116, 52] : [78, 98, 46];   // duckweed and lily pads
            if (sp > 0.975) sh = [110, 104, 62];                                            // a reed's pale stem
            else if (sp > 0.955) sh = [36, 40, 28];
            col = [col[0] + (sh[0] - col[0]) * k, col[1] + (sh[1] - col[1]) * k, col[2] + (sh[2] - col[2]) * k];
          } else if (fv > 0.3) {   // the ford: a bed of rounded stones and sand under shallow water, with ripples
            const k = Math.min(1, (fv - 0.3) / 0.12), st = fordStone(x, y, seed);
            let sh;
            if (st) {   // a stone breaking the surface, lit from the upper left, wet and dark at its rim
              const [dx, dy, tone] = st, lit = -(dx + dy) * 0.5, rim = dx * dx + dy * dy > 0.62;
              const base = [[86, 80, 70], [104, 96, 84], [122, 114, 98], [96, 92, 86]][Math.floor(tone * 4)];
              const m = rim ? 0.62 : 1 + lit * 0.45;
              sh = [base[0] * m, base[1] * m, base[2] * m];
              if (!rim && lit > 0.35 && sp > 0.4) sh = [168, 160, 142];   // a dry, sunlit top
            } else {
              const bed = sp > 0.85 ? [70, 66, 58] : pickTone(SANDS, hh * 1.2 - 0.45 + (sp - 0.5) * 0.5);
              const shade = fordStone(x - 2, y - 2, seed) ? 0.6 : 1;   // stones shade the bed below-right of them
              sh = [(bed[0] + (80 - bed[0]) * 0.42) * shade, (bed[1] + (116 - bed[1]) * 0.42) * shade, (bed[2] + (138 - bed[2]) * 0.42) * shade];
              if (((xi * 2 + Math.floor(noise(N1, x, (y * 4) % WORLD) * 24 * K)) % (13 * K) === 0) && sp > 0.25) sh = [176, 196, 204];   // white water between the stones
            }
            col = [col[0] + (sh[0] - col[0]) * k, col[1] + (sh[1] - col[1]) * k, col[2] + (sh[2] - col[2]) * k];
          }
        } else if (SOFT && wv > 0.3) {   // (look.js test: the shore's sand fades in from the grass)
          const sd = pickTone(SANDS, (wv - 0.36) * 4 + (sp - 0.5) * 0.7), k = sm(Math.min(1, (wv - 0.3) / 0.1));
          col = [col[0] + (sd[0] - col[0]) * k, col[1] + (sd[1] - col[1]) * k, col[2] + (sd[2] - col[2]) * k];
          if (sp > 0.95 && k > 0.6) col = snow ? [96, 98, 104] : [92, 86, 74];
        } else if (wv > 0.36) {
          col = pickTone(SANDS, (wv - 0.36) * 4 + (sp - 0.5) * 0.7);
          if (sp > 0.93) col = snow ? [96, 98, 104] : [92, 86, 74];            // pebbles
        }
        if (hgt && !(wv > 0.5)) {   // hills (look test): slopes toward the sun (the screen's upper left) lit, the others shaded
          const h0 = bil(hgt, fx, fy), gx = (bil(hgt, fx + 0.25, fy) - bil(hgt, fx - 0.25, fy)) / (CELL * 0.5), gy = (bil(hgt, fx, fy + 0.25) - bil(hgt, fx, fy - 0.25)) / (CELL * 0.5);
          // HILL_SHADE: how strongly (1: the first version; owner 2026-11-19: "too faint"). Lit slopes a little warmer,
          // shaded ones a little cooler.
          const HS = typeof HILL_SHADE !== 'undefined' ? HILL_SHADE : 1;
          const lit = Math.max(-0.45 - 0.12 * (HS - 1), Math.min(0.4 + 0.1 * (HS - 1), (gx * 0.937 - gy * 0.351) * 4.2 * HS));
          const k = (1 + lit) * (1 + h0 * 0.005 * HS), wt = HS > 1 ? lit * 0.12 : 0;
          col = [col[0] * k * (1 + wt), col[1] * k, col[2] * k * (1 - wt)];
        }
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
      }
    }
    const flush = mesas && mesas.length && hgt ? (x, y) => mesas.some((m) => Math.hypot(x / CELL - m.x, y / CELL - m.y) < m.r + 1 && bil(hgt, x / CELL - 0.5, y / CELL - 0.5) >= m.T - 1.5) : null;
    if (P.cliff) paintCliffs(d, P.cliff, seed, snow, X0, Y0, w, h, flush, K);
    if (roads && roads.length) paintRuts(d, roads, X0, Y0, w, h, K);
  }
  return { pixels };
}
// Baked sprites (tools/bake-sprites.js; here, not in models.js, whose text the bake's --check hashes): sheets of finished pictures in sprites/, loaded in the background and cut
// into the sprite cache, so the game does not render voxel models while you play. need(['allies0', ...]) loads those
// sheets (faction and team colour 0-2, or 'burnt'); a sprite not loaded yet, or not baked, is rendered as before. Only
// over http(s) and in the Windows app (a page opened from a file cannot read pictures back, which tests rely on).
const SpriteSheets = (() => {
  let man = null, manP = null, nmanP = null;
  const loaded = new Set();
  const ok = () => typeof location !== 'undefined' && /^(https?|app):$/.test(location.protocol) && typeof createImageBitmap === 'function' && typeof fetch === 'function'
    && !(typeof HEADLESS !== 'undefined' && HEADLESS);
  // Manifests are always checked with the server (cache: 'no-cache') and each sheet is asked for with its bake's hash in the
  // address, so a browser's cached sheet from an older bake is never cut with a newer manifest's layout (owner, 2026-11-21:
  // after 2026.11.21.3 moved 456 sprites in allies0, a phone drew its own units from the wrong spots: invisible).
  // HD (HD.on): sprites-hd/ and normals-hd/, the same layout with pictures of man.k pixels per world pixel; if they are
  // not there (an older copy of the files), the ordinary ones.
  let dir = 'sprites/', ndir = 'normals/';
  const getMan = (d) => fetch(d + 'manifest.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const manifest = () => manP || (manP = (async () => {
    if (HD.on) { const m = await getMan('sprites-hd/'); if (m && m.k > 1) { dir = 'sprites-hd/'; ndir = 'normals-hd/'; return (man = m); } }
    return (man = await getMan('sprites/'));
  })());
  async function load(name) {
    const m = await manifest();
    const sh = m && m.sheets.find((x) => x.file.split('.')[0] === name);
    if (!sh) return;
    const K = m.k || 1;
    const r = await fetch(dir + sh.file + '?h=' + m.hash);
    if (!r.ok) return;
    const bmp = await createImageBitmap(await r.blob());
    const cut = (x, y, w, h) => createImageBitmap(bmp, x, y, w, h);
    // With the WebGL renderer (gl.js), the sheet's normal maps too (tools/bake-normals.js: normals/, the same layout),
    // if they were baked from these very sprites: each picture's goes with it (img._nrm), so it is not worked out in play.
    let nbmp = null;
    if (typeof GLR !== 'undefined' && GLR.on) {
      const nm = await (nmanP || (nmanP = fetch(ndir + 'manifest.json', { cache: 'no-cache' }).then((x) => (x.ok ? x.json() : null)).catch(() => null)));
      const ns = nm && nm.sprites === m.hash && nm.sheets.find((x) => x.of === sh.file);
      if (ns) { const r2 = await fetch(ndir + ns.file + '?h=' + nm.hash).catch(() => null); if (r2 && r2.ok) nbmp = await createImageBitmap(await r2.blob()).catch(() => null); }
    }
    for (let i = 0; i < sh.sprites.length; i += 64) {   // a few at a time, so loading never holds up a frame
      await Promise.all(sh.sprites.slice(i, i + 64).map(async (e) => {
        if (spriteCache2.has(e[0])) return;
        const s = { img: await cut(e[1], e[2], e[3], e[4]), ox: e[5], oy: e[6] };
        s.img._ox = e[5]; s.img._oy = e[6];   // (uprightCtx)
        if (K > 1) s.img._k = K;
        if (nbmp) s.img._nrm = await createImageBitmap(nbmp, e[1], e[2], e[3], e[4]);
        if (e.length > 7) { s.sh = await cut(e[7], e[8], e[9], e[10]); s.sox = e[11]; s.soy = e[12]; s.sh._ox = e[11]; s.sh._oy = e[12]; if (K > 1) s.sh._k = K; }
        if (spriteCache2.has(e[0])) return;
        spriteCache2.set(e[0], s);
        const mk = e[0].slice(0, e[0].lastIndexOf('|'));
        if (!spriteAny.has(mk)) spriteAny.set(mk, s);
      }));
    }
    if (bmp.close) bmp.close();
    if (nbmp && nbmp.close) nbmp.close();
  }
  let chain = Promise.resolve(), pending = 0;
  function need(names) {
    if (!ok()) return;
    for (const n of names) {
      if (loaded.has(n)) continue;
      loaded.add(n); pending++;
      chain = chain.then(() => load(n)).catch(() => {}).then(() => { pending--; });
    }
  }
  // ready(): every sheet asked for so far is in (ui.js holds a battle's start on it, briefly).
  return { need, ready: () => pending === 0, get pending() { return pending; }, loaded: () => [...loaded], get manifest() { return man; }, get dir() { return dir; } };
})();
SpriteSheets.need(['allies0', 'soviets0', 'burnt']);   // the main colours, in the background from the start
// HD: a sprite not in the baked sheets (a damaged structure, a turret head, a structure going up) is rendered here at HD.K
// pixels per world pixel, with soft edges (not crisp) and a soft shadow; its offsets stay in world pixels. Not for what
// is painted into the ground (FLAT_PASS), which is at one pixel per world pixel.
if (HD.on && typeof sprite === 'function') {
  const orig = sprite, K = HD.K;
  sprite = function (mkey, build, angle, fkey, opts) {
    if (FLAT_PASS) return orig(mkey, build, angle, fkey, opts);
    const o = Object.assign({}, opts), div = o.fit ? K : (o.scale || 1) * K;
    o.scale = (o.scale || 1) * K; o.fit = true; o.crisp = false;
    const s = orig(mkey, build, angle, fkey, o);
    if (!s || s._hd || !s.img || s.img._k || (typeof ImageBitmap !== 'undefined' && s.img instanceof ImageBitmap)) return s;   // (baked: as it is)
    s._hd = true;
    s.ox /= div; s.oy /= div; s.img._ox = s.ox; s.img._oy = s.oy; s.img._k = K;
    if (s.sh) {
      const sh = softShadow(s.sh, K);
      s.sox = s.sox / div - sh._pad / K; s.soy = s.soy / div - sh._pad / K;
      sh._ox = s.sox; sh._oy = s.soy; sh._k = K; sh._shade = s.sh._shade; s.sh = sh;
    }
    return s;
  };
}

// The baked ground (tools/bake-ground.js): the fixed maps' ground (maps traced from a design, `rows` in MAPS) painted
// once into pictures, grounds/<map>/<i>.webp in GROUND_SHEET squares (row by row) and grounds/<map>/preview.webp at a
// quarter size, so a battle shows pictures instead of painting the ground (makeGround). A map's entry in
// grounds/manifest.json is used only if its `key` matches the battle's ground (groundKey), so a changed layout falls
// back to painting until it is rebaked. Over http(s) and app: only, as SpriteSheets.
const GROUND_SHEET = 1024;
const GroundSheets = (() => {
  let man = null;
  const ok = () => typeof location !== 'undefined' && /^(https?|app):$/.test(location.protocol) && typeof createImageBitmap === 'function' && typeof fetch === 'function'
    && !(typeof HEADLESS !== 'undefined' && HEADLESS);
  if (ok()) fetch('grounds/manifest.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((m) => { man = m; }).catch(() => {});
  return { get manifest() { return man; }, ok };
})();
// Fixed maps paint the same ground every game (so it can be baked); generated maps vary it with the battle's seed.
function groundSeed(g) { return MAPS[validMap(g.mapId)].rows ? 0x2b1d5eed : g.seed; }
// A hash of everything the ground of battle g is painted from (the baked pictures are only used when it matches).
function groundKey(g) {
  let h = 0x811c9dc5 | 0;
  const num = (v) => { h = Math.imul(h ^ (v | 0), 16777619); };
  const str = (t) => { for (let i = 0; i < t.length; i++) num(t.charCodeAt(i)); };
  str(JSON.stringify(['live-trees', validMap(g.mapId), MAP, CELL, GROUND_TILE, GROUND_SHEET, groundSeed(g), mapTheme(g.mapId), MAPS[validMap(g.mapId)].bridge || '', g.bridges || []]));
  for (const a of [g.terr, g.road, g.cliff, g.ford]) { num(a ? a.length : -1); if (a) for (let i = 0; i < a.length; i++) num(a[i]); }
  if (g.hgt) for (let i = 0; i < g.hgt.length; i++) num(Math.round(g.hgt[i] * 16));   // (the hills: look test)
  if (g.hgt && typeof HILL_SHADE !== 'undefined' && HILL_SHADE !== 1) num(Math.round(HILL_SHADE * 100));   // (their shading's strength)
  return (h >>> 0).toString(16);
}

// The ground painter for one map: paint(g, x0, y0, w, h, ox, oy) paints that part of the ground (world pixels) into
// g at (ox, oy): the pixels (groundPixels), then bridges and scenery on top (decorate). Every pixel depends only on
// where it is, so parts painted one by one fit together exactly (the ground tiles, makeGround). The scenery and
// bridges are prepared once, at the first paint. args: groundPixels' arguments (for the workers).
// bridgeKind: 'concrete', or timber when not given (`bridge` in MAPS).
// A map's mesas for groundPixels: where each is and its top's height (G.hgt units).
function mesaTops(id) { return (MAPS[validMap(id)].mesas || []).map((m) => ({ x: m.x, y: m.y, r: m.r, T: HG_MAX * (m.h || 1) })); }
function groundPainter(terr, seed, roads, bridges, cliffs, fords, theme, bridgeKind, hgt, mesas) {
  const snow = theme === 'snow', px = groundPixels(terr, seed, roads, cliffs, fords, theme, hgt, mesas);
  let P = null;   // scenery stamps and bridge pictures
  function prepare() {
    buildScenery();
    // Scenery stamps, back to front, each with the box it covers (shadow included).
    const rs = rng(seed ^ 0x2c1b3c6d), stamps = [], trees = [];
    const sprite = (s, x, y) => {
      const x0 = Math.min(Math.round(x + s.ox), Math.round(x + s.sox)), y0 = Math.min(Math.round(y + s.oy), Math.round(y + s.soy));
      const x1 = Math.max(Math.round(x + s.ox) + s.img.width, Math.round(x + s.sox) + s.sh.width), y1 = Math.max(Math.round(y + s.oy) + s.img.height, Math.round(y + s.soy) + s.sh.height);
      stamps.push({ s, x, y, x0, y0, x1, y1 });
    };
    for (let cy = 0; cy < MAP; cy++) {
      for (let cx = 0; cx < MAP; cx++) {
        const t = terr[cy * MAP + cx], x0 = cx * CELL, y0 = cy * CELL;
        if (t === 2) {
          const n = 1 + (rs() < 0.5 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const pine = rs() < 0.4;
            const set = snow ? scenery.snowPines : pine ? scenery.pines : scenery.trees;   // winter woods are all snowy pines
            const v = Math.floor(rs() * set.length);
            // Trees are not painted into the ground: they sway in the wind and can burn (treesInView, drawTree).
            trees.push({ s: set[v], burnt: (snow || pine ? scenery.burntPines : scenery.burntTrees)[v % 5], pine: snow || pine, x: x0 + 4 + rs() * 16, y: y0 + 6 + rs() * 14 });
          }
        } else if (t === 5 && fords && fords[cy * MAP + cx]) {
          if (rs() < 0.3) sprite(scenery.rocks[Math.floor(rs() * scenery.rocks.length)], x0 + 4 + rs() * 16, y0 + 4 + rs() * 16);   // a few boulders in the ford
        } else if (t === 3 && cliffs && cliffs[cy * MAP + cx]) {
          // painted with the ground (paintCliffs)
        } else if (t === 3) {
          sprite(scenery.rocks[Math.floor(rs() * scenery.rocks.length)], x0 + 12 + (rs() - 0.5) * 4, y0 + 13 + (rs() - 0.5) * 4);
        } else if (t === 0 && rs() < 0.28 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => terr[(cy + oy) * MAP + cx + ox] === 4)) {
          sprite(scenery.rocks[Math.floor(rs() * scenery.rocks.length)], x0 + rs() * CELL, y0 + rs() * CELL);
        } else if (t === 0 && rs() < 0.035) {
          const x = Math.round(x0 + rs() * CELL), y = Math.round(y0 + rs() * CELL);
          stamps.push({ bush: true, x, y, x0: x - 2, y0: y - 3, x1: x + 6, y1: y + 3 });
        }
      }
    }
    stamps.sort((a, b) => a.y - b.y);
    trees.sort((a, b) => a.y - b.y);
    // Bridges over the lakes (timber: stone abutments, plank deck, rails on posts; or concrete). Each is drawn once into its own
    // picture: drawn turned on every tile, its smoothed edges would differ a little from tile to tile.
    const bridgePics = (bridges || []).map((b) => {
      const dx = b.b.x - b.a.x, dy = b.b.y - b.a.y, L = Math.hypot(dx, dy), bw = b.w, ang = Math.atan2(dy, dx);
      const corners = [[-8, -bw / 2 - 5], [L + 8, -bw / 2 - 5], [-8, bw / 2 + 9], [L + 8, bw / 2 + 9]].map(([u, v]) => [b.a.x + u * Math.cos(ang) - v * Math.sin(ang), b.a.y + u * Math.sin(ang) + v * Math.cos(ang)]);
      const x0 = Math.floor(Math.min(...corners.map((c) => c[0]))) - 2, y0 = Math.floor(Math.min(...corners.map((c) => c[1]))) - 2;
      const x1 = Math.ceil(Math.max(...corners.map((c) => c[0]))) + 2, y1 = Math.ceil(Math.max(...corners.map((c) => c[1]))) + 2;
      const c = mkCanvas((x1 - x0) * GK, (y1 - y0) * GK), g = c.getContext('2d');   // (HD ground: at its pixels per world pixel)
      g.scale(GK, GK); g.translate(b.a.x - x0, b.a.y - y0); g.rotate(ang);
      if (bridgeKind === 'concrete') concreteBridge(g, L, bw, seed, snow);
      else {   // timber
        g.fillStyle = 'rgba(10,20,30,0.45)'; g.fillRect(4, -bw / 2 + 6, L - 8, bw);              // shadow on the water
        for (const u0 of [-6, L - 10]) { g.fillStyle = '#6f6a5e'; g.fillRect(u0, -bw / 2 - 3, 16, bw + 6); g.fillStyle = '#56524a'; g.fillRect(u0, bw / 2 + 1, 16, 2); }
        for (let x = 6; x < L - 6; x += 22) { g.fillStyle = '#2e2418'; g.fillRect(x, -bw / 2 + 1, 3, bw + 6); }   // piles
        g.fillStyle = '#6b5638'; g.fillRect(0, -bw / 2, L, bw);
        for (let x = 0, i = 0; x < L; x += 3, i++) {
          g.fillStyle = ['#7a6342', '#634f33', '#705a3b', '#5a4730'][(i * 7 + (i >> 2)) % 4];
          g.fillRect(x, -bw / 2 + 2, 2, bw - 4);
        }
        g.fillStyle = '#3a2d1d'; g.fillRect(0, -bw / 2, L, 2); g.fillRect(0, bw / 2 - 2, L, 2);
        for (let x = 2; x < L; x += 10) { g.fillStyle = '#2a2015'; g.fillRect(x, -bw / 2 - 1, 2, 3); g.fillRect(x, bw / 2 - 2, 2, 3); }
      }
      return { c, x: x0, y: y0 };
    });
    P = { bridges: bridgePics, stamps, trees };
  }
  // Bridges and scenery over that part of the ground, already in g at (ox, oy).
  // K (HD ground): g holds K pixels per world pixel (ox, oy, w, h stay in world pixels).
  function decorate(g, X0, Y0, w, h, ox = 0, oy = 0, K = 1) {
    if (!P) prepare();
    g.save();
    if (K !== 1) g.scale(K, K);
    g.beginPath(); g.rect(ox, oy, w, h); g.clip();
    g.translate(ox - X0, oy - Y0);

    // Timber bridges (drawn once each, in prepare, so every tile gets the same pixels).
    for (const b of P.bridges) g.drawImage(b.c, b.x, b.y, b.c.width / GK, b.c.height / GK);

    // Scenery stamps that reach into this part, shadows first.
    const here = P.stamps.filter((s) => s.x1 > X0 && s.x0 < X0 + w && s.y1 > Y0 && s.y0 < Y0 + h);
    // (an HD picture, _k, at its world size)
    for (const s of here) if (s.s) { g.globalAlpha = 0.45; g.drawImage(s.s.sh, Math.round(s.x + s.s.sox), Math.round(s.y + s.s.soy), picW(s.s.sh), picH(s.s.sh)); g.globalAlpha = 1; }
    for (const s of here) {
      if (s.s) { g.drawImage(s.s.img, Math.round(s.x + s.s.ox), Math.round(s.y + s.s.oy), picW(s.s.img), picH(s.s.img)); continue; }
      const x = s.x, y = s.y;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1, y + 1, 5, 2);
      g.fillStyle = '#1f2e15'; g.fillRect(x - 2, y - 2, 5, 3);
      g.fillStyle = snow ? '#e4eaf2' : '#304a1d'; g.fillRect(x - 1, y - 3, 3, 2);   // in winter, snow on the bush
      g.fillStyle = snow ? '#ffffff' : '#46632a'; g.fillRect(x - 1, y - 3, 1, 1);
    }
    g.restore();
  }
  function paint(g, X0, Y0, w, h, ox = 0, oy = 0, K = 1) {
    const img = g.createImageData(w * K, h * K);
    px.pixels(img.data, X0, Y0, w, h, K);
    g.putImageData(img, ox * K, oy * K);
    decorate(g, X0, Y0, w, h, ox, oy, K);
  }
  return { paint, decorate, trees: () => { if (!P) prepare(); return P.trees; }, stamps: () => { if (!P) prepare(); return P.stamps; }, args: [terr, seed, roads, cliffs, fords, theme, hgt, mesas] };
}
// Wheel ruts along the roads, worked out pixel by pixel (not stroked on the canvas, whose smoothing differs with
// where a picture's edge falls) so they run on unbroken across the ground's tiles. Each rut darkens or lightens a
// pixel once, however many of its segments cover it.
function paintRuts(d, roads, X0, Y0, w, h, K = 1) {
  const W = w * K, FX = X0 * K, FY = Y0 * K, FW = (X0 + w) * K, FH = (Y0 + h) * K;   // (HD ground: the fine grid, K per world pixel)
  const mask = new Uint8Array(W * h * K);
  for (const road of roads) {
    if (road.length < 2) continue;
    for (const [off, col, a, lw] of [[-5, [58, 44, 26], 0.45, 2], [5, [58, 44, 26], 0.45, 2], [-4, [170, 150, 110], 0.18, 1], [6, [170, 150, 110], 0.18, 1]]) {
      const pts = road.map((pt, i) => {
        const A = road[Math.min(road.length - 1, i + 1)], B = road[Math.max(0, i - 1)];
        const dx = A.x - B.x, dy = A.y - B.y, l = Math.hypot(dx, dy) || 1;
        return [pt.x - dy / l * off, pt.y + dx / l * off];
      });
      const hit = [];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        if (Math.max(x0, x1) < X0 - 4 || Math.min(x0, x1) > X0 + w + 4 || Math.max(y0, y1) < Y0 - 4 || Math.min(y0, y1) > Y0 + h + 4) continue;
        const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2 * K) || 1, L = lw * K;
        for (let k = 0; k <= steps; k++) {
          const x = (x0 + (x1 - x0) * k / steps + 0.5) * K - 0.5, y = (y0 + (y1 - y0) * k / steps + 0.5) * K - 0.5;
          for (let py = Math.round(y - L / 2); py < Math.round(y - L / 2) + L; py++) for (let px = Math.round(x - L / 2); px < Math.round(x - L / 2) + L; px++) {
            if (px < FX || py < FY || px >= FW || py >= FH) continue;
            const q = (py - FY) * W + px - FX;
            if (!mask[q]) { mask[q] = 1; hit.push(q); }
          }
        }
      }
      for (const q of hit) { mask[q] = 0; const p = q * 4; d[p] += (col[0] - d[p]) * a; d[p + 1] += (col[1] - d[p + 1]) * a; d[p + 2] += (col[2] - d[p + 2]) * a; }
    }
  }
}
// A concrete road bridge, drawn along +x from 0 to L, bw wide: square piers and abutments, a pale speckled deck with
// expansion joints and worn wheel tracks, kerbs and parapets with their posts. In winter, snow banked against the
// parapets and slush in the tracks.
function concreteBridge(g, L, bw, seed, snow) {
  const r = rng(seed ^ 0x6c1e2b), h = bw / 2;
  g.fillStyle = 'rgba(10,20,30,0.5)'; g.fillRect(4, -h + 7, L - 8, bw);                      // shadow on the water
  for (let x = 30; x < L - 24; x += 46) {                                                   // piers, showing past the deck
    g.fillStyle = '#4c4e52'; g.fillRect(x, -h - 3, 10, bw + 7);
    g.fillStyle = '#6e7074'; g.fillRect(x, -h - 3, 10, 2);
  }
  for (const u0 of [-8, L - 10]) {                                                          // abutments
    g.fillStyle = '#7c7e82'; g.fillRect(u0, -h - 4, 18, bw + 8);
    g.fillStyle = '#5a5c60'; g.fillRect(u0, h + 2, 18, 2);
    g.fillStyle = '#9a9ca0'; g.fillRect(u0, -h - 4, 18, 1);
  }
  const deck = [[132, 134, 138], [142, 144, 148], [150, 152, 156], [124, 126, 130]];
  for (let y = -h; y < h; y++) for (let x = 0; x < L; x++) {
    const v = r(), t = deck[v < 0.55 ? 1 : v < 0.8 ? 2 : v < 0.95 ? 0 : 3];
    g.fillStyle = `rgb(${t[0]},${t[1]},${t[2]})`; g.fillRect(x, y, 1, 1);
  }
  for (const v of [-h * 0.42, h * 0.42]) {                                                  // worn wheel tracks (slush in winter)
    for (let x = 0; x < L; x++) if (r() < 0.85) { g.fillStyle = snow ? (r() < 0.5 ? '#8a8784' : '#7c7976') : (r() < 0.5 ? '#7a7c80' : '#828488'); g.fillRect(x, Math.round(v - 2 + r() * 1.2), 1, 4); }
  }
  for (let x = 24; x < L - 8; x += 32) { g.fillStyle = '#5e6064'; g.fillRect(x, -h + 4, 1, bw - 8); g.fillStyle = '#a4a6aa'; g.fillRect(x + 1, -h + 4, 1, bw - 8); }   // expansion joints
  // Parapets: a pale top, a dark outer face, posts along them.
  for (const [y0, out] of [[-h, -1], [h - 4, 1]]) {
    g.fillStyle = '#b6b8bc'; g.fillRect(0, y0, L, 4);
    g.fillStyle = '#d2d4d8'; g.fillRect(0, y0 + 1, L, 1);
    g.fillStyle = '#3e4044'; g.fillRect(0, out < 0 ? y0 - 1 : y0 + 4, L, 1);
    g.fillStyle = '#7a7c80'; g.fillRect(0, out < 0 ? y0 + 4 : y0 - 1, L, 1);              // the kerb's shadow on the deck
    for (let x = 4; x < L - 2; x += 12) { g.fillStyle = '#5a5c60'; g.fillRect(x, y0, 2, 4); }
  }
  if (snow) {   // snow banked against the parapets and on their tops
    for (const [y0, dir] of [[-h + 4, 1], [h - 5, -1]]) for (let x = 0; x < L; x++) {
      const deep = 1 + Math.floor(r() * 3);
      for (let k = 0; k < deep; k++) { g.fillStyle = k === deep - 1 ? '#c9d1dd' : '#e6ecf3'; g.fillRect(x, y0 + dir * k, 1, 1); }
      if (r() < 0.5) { g.fillStyle = '#f1f5fa'; g.fillRect(x, dir > 0 ? -h + 1 : h - 3, 1, 1); }
    }
  }
}

// The whole ground in one picture (tests and tools; the game paints it in tiles, makeGround).
function paintTerrain(terr, seed, roads, bridges, cliffs, fords, theme, bridgeKind, hgt = typeof G !== 'undefined' && G ? G.hgt : null) {
  const c = mkCanvas(WORLD, WORLD);
  groundPainter(terr, seed, roads, bridges, cliffs, fords, theme, bridgeKind, hgt).paint(c.getContext('2d'), 0, 0, WORLD, WORLD);
  return c;
}

// The stones of a ford's bed: one in most 8-pixel squares, jittered, 2 to 5 pixels across. Returns the
// offset from the stone's middle (scaled to its size) and its tone, or null between stones.
function fordStone(x, y, seed) {
  const S = 8, gi = Math.floor(x / S), gj = Math.floor(y / S);
  const hs = (i, j, k) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k + seed, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  for (let j = gj - 1; j <= gj + 1; j++) for (let i = gi - 1; i <= gi + 1; i++) {
    if (hs(i, j, 1) > 0.78) continue;
    const big = hs(i, j, 5) > 0.85, rad = big ? 4.5 + hs(i, j, 4) * 2 : 2 + hs(i, j, 4) * 2.6;
    const dx = (x - (i + 0.15 + 0.7 * hs(i, j, 2)) * S) / rad, dy = (y - (j + 0.15 + 0.7 * hs(i, j, 3)) * S) / (rad * 0.8);
    if (dx * dx + dy * dy < 1) return [dx, dy, hs(i, j, 6)];
  }
  return null;
}

// Cliffs (cliff cells of a fixed-layout map): painted into the ground as a continuous rocky ridge.
// The ground rises to a jagged crest over the cliff cells (a height field with noise), and the slopes are shaded as if lit from the upper left,
// in browns and tans, with a shadow on the ground below and loose scree at the foot.
const CLIFF_H = 16;
// For each cell within 2 of a cliff cell, the middles (world pixels) of the cliff cells that raise it.
function cliffCells(terr, cliffs) {
  const isC = (x, y) => x >= 0 && y >= 0 && x < MAP && y < MAP && terr[y * MAP + x] === 3 && cliffs[y * MAP + x];
  const cells = new Map(), R = 2;
  for (let cy = 0; cy < MAP; cy++) for (let cx = 0; cx < MAP; cx++) {
    if (!isC(cx, cy)) continue;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const x = cx + i, y = cy + j;
      if (x < 0 || y < 0 || x >= MAP || y >= MAP) continue;
      let l = cells.get(y * MAP + x); if (!l) cells.set(y * MAP + x, l = []);
      l.push((cx + 0.5) * CELL, (cy + 0.5) * CELL);
    }
  }
  return cells;
}
// Paints the cliffs over the part of the ground in d (w x h pixels from world X0, Y0).
// K (HD ground): K x K pixels per world pixel in d; the heights are worked out on that fine grid (xf, yf), at each small
// pixel's middle (world (xf + 0.5) / K - 0.5). K 1: as before.
function paintCliffs(d, cells, seed, snow, X0, Y0, w, h, flush, K = 1) {
  // Value noise on an unbounded lattice.
  const hash = (i, j, k) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k + seed, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vn = (x, y, s, k) => {
    const fx = x / s, fy = y / s, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
    const a = hash(i, j, k), b = hash(i + 1, j, k), c = hash(i, j + 1, k), e = hash(i + 1, j + 1, k);
    return (a + (b - a) * u) * (1 - v) + (c + (e - c) * u) * v;
  };
  // The ridge: every cliff cell spreads a soft mound; where the mounds add up past a threshold the
  // ground rises, so lines, corners and doubled lines all merge into one ridge with a jagged edge.
  const SIG2 = 2 * 10 * 10;
  const height = (x, y) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    const l = cx >= 0 && cy >= 0 && cx < MAP && cy < MAP && cells.get(cy * MAP + cx);
    if (!l) return 0;
    let o = 0;
    for (let i = 0; i < l.length; i += 2) { const dx = x - l[i], dy = y - l[i + 1]; o += Math.exp(-(dx * dx + dy * dy) / SIG2); }
    o += (vn(x, y, 11, 1) - 0.5) * 0.75 + (vn(x, y, 4, 7) - 0.5) * 0.3 + (vn(x, y, 1.6, 2) - 0.5) * 0.12;   // ragged edge
    const q = (o - 0.5) / 0.5;
    if (q <= 0) return 0;
    const f = Math.min(1, q * 2.5);   // crags and facets fade in from the foot
    return CLIFF_H * Math.pow(q, 0.7) * (0.75 + 0.5 * vn(x, y, 16, 3)) + ((vn(x, y, 5, 4) - 0.5) * 7 + (vn(x, y, 2, 6) - 0.5) * 2.5) * f;
  };
  // Winter: grey rock, its sunlit faces and tops under snow.
  const ROCK = snow ? [[40, 42, 50], [58, 60, 68], [80, 82, 92], [104, 106, 116], [150, 156, 170], [206, 214, 226], [236, 240, 247]]
    : [[44, 34, 26], [62, 49, 36], [84, 67, 49], [108, 88, 65], [134, 112, 84], [162, 139, 106], [190, 168, 132]];
  const lx = -0.55, ly = -0.65, lz = 0.52;   // towards the light
  // Work the height out once per pixel (only cells near a cliff can rise) over this part and a margin (the
  // shading looks one pixel round, the ridge's shadow 6 up and to the left), then shade from that.
  const wd = (f) => (K === 1 ? f : (f + 0.5) / K - 0.5), CK = CELL * K;   // a fine pixel's world spot; a cell in fine pixels
  const MX0 = (X0 - 6) * K, MY0 = (Y0 - 7) * K, MW = (w + 8) * K, MH = (h + 9) * K, hts = new Float32Array(MW * MH);
  let any = false;
  for (let cy = Math.floor(MY0 / CK); cy <= Math.floor((MY0 + MH - 1) / CK); cy++) for (let cx = Math.floor(MX0 / CK); cx <= Math.floor((MX0 + MW - 1) / CK); cx++) {
    if (cx < 0 || cy < 0 || cx >= MAP || cy >= MAP || !cells.has(cy * MAP + cx)) continue;
    any = true;
    for (let y = Math.max(MY0, cy * CK); y < Math.min(MY0 + MH, (cy + 1) * CK); y++) for (let x = Math.max(MX0, cx * CK); x < Math.min(MX0 + MW, (cx + 1) * CK); x++) hts[(y - MY0) * MW + x - MX0] = height(wd(x), wd(y));
  }
  if (!any) return;
  const WK = WORLD * K, H = (x, y) => (x < 0 || y < 0 || x >= WK || y >= WK ? 0 : hts[(y - MY0) * MW + x - MX0]);
  for (let y = Y0 * K; y < (Y0 + h) * K; y++) for (let x = X0 * K; x < (X0 + w) * K; x++) {
    if (!cells.has(Math.floor(y / CK) * MAP + Math.floor(x / CK))) continue;
    if (flush && flush(wd(x), wd(y))) continue;   // (a mesa's level top: its crags draw the rim)
    const p = ((y - Y0 * K) * w * K + x - X0 * K) * 4, hh = H(x, y), sp = hash(x, y, 9);
    if (hh <= 0.4) {
      const sh = H(x - 5 * K, y - 6 * K);   // the ridge's shadow on the ground below it
      if (sh > 5) { const k = sh > 9 ? 0.55 : 0.7; d[p] *= k; d[p + 1] *= k; d[p + 2] *= k; }
      else if (hh > 0 && sp < 0.35) { const t = ROCK[1 + Math.floor(sp * 8)]; d[p] = t[0]; d[p + 1] = t[1]; d[p + 2] = t[2]; }   // scree
      continue;
    }
    const gx = (H(x + 1, y) - H(x - 1, y)) * K, gy = (H(x, y + 1) - H(x, y - 1)) * K;
    const nl = Math.hypot(gx * 0.5, gy * 0.5, 1), lit = (-gx * 0.5 * lx - gy * 0.5 * ly + lz) / nl;
    let v = 2.3 + (lit - lz) * 7 + hh / CLIFF_H * 1.2 + (sp - 0.5) * 0.6;   // flat ground mid-brown, sunlit faces tan, the rest dark
    if (vn(wd(x), wd(y), 4, 5) > 0.72) v -= 1.2;   // cracks and gullies
    const t = ROCK[Math.max(0, Math.min(ROCK.length - 1, Math.floor(v)))];
    const a = Math.min(1, (hh - 0.4) * 1.5);   // the foot blends into the ground
    d[p] += (t[0] - d[p]) * a; d[p + 1] += (t[1] - d[p + 1]) * a; d[p + 2] += (t[2] - d[p + 2]) * a;
  }
}

// Permanent marks burnt into the terrain: a crater with a lit rim and scattered soot.
function scorch(tg, x, y, rad, seed) {
  const r = rng(seed);
  for (let i = 0; i < rad * 5; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad * 1.3;
    tg.fillStyle = r() < 0.5 ? 'rgba(18,14,10,0.28)' : 'rgba(40,32,24,0.28)';
    tg.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.8), 2, 1);
  }
  if (rad > 7) {
    tg.fillStyle = 'rgba(20,16,12,0.45)';
    tg.beginPath(); tg.ellipse(x, y, rad * 0.45, rad * 0.32, 0, 0, 7); tg.fill();
    tg.strokeStyle = 'rgba(150,130,100,0.25)'; tg.lineWidth = 1;
    tg.beginPath(); tg.ellipse(x + 0.5, y + 0.5, rad * 0.5, rad * 0.36, 0, 0.2, 2.6); tg.stroke();
  }
}
// Shell crater: thrown-out earth, a raised rim, a dark pit whose far wall catches the light.
function crater(tg, x, y, rad, seed, dig) {
  // A crater that digs the ground (world.js digCrater, dig set): the shaded bowl (lookfx.js craterPic), painted into the
  // ground here like every other mark, so the wreck or body baked after it lies on top. (It used to be drawn over the
  // finished ground every frame, lookCraters, and hid the wreck of every vehicle, whose death digs one under it.)
  if (dig && typeof LOOK !== 'undefined' && LOOK.craters && typeof craterPic === 'function') {
    const X = Math.round(x), Y = Math.round(y), h = ((X * 73856093) ^ (Y * 19349663)) >>> 0;
    const K = tg._gk || 1, pic = craterPic(h % CRATER_VAR, typeof mapTheme === 'function' && mapTheme(G.mapId) === 'snow', rad >= 8, K);   // (HD ground: at its detail)
    const s = rad >= 8 ? 0.85 + Math.min(0.4, (rad - 8) * 0.12) : 0.8 + (rad - 5) * 0.1, w = pic.width / K * s;   // (digCrater's bowl: about this size)
    const sm = tg.imageSmoothingEnabled; tg.imageSmoothingEnabled = false;
    tg.drawImage(pic, Math.round(X - w / 2), Math.round(Y - w / 2), w, w);
    tg.imageSmoothingEnabled = sm;
    return;
  }
  const r = rng(seed), ry = rad * 0.7;
  const oval = (cx, cy, rx, ryy, col) => { tg.fillStyle = col; tg.beginPath(); tg.ellipse(cx, cy, rx, ryy, 0, 0, 7); tg.fill(); };
  for (let i = 0; i < rad * 6; i++) {
    const a = r() * Math.PI * 2, d = rad * (0.9 + r() * 0.9);
    tg.fillStyle = r() < 0.5 ? 'rgba(92,74,52,0.55)' : 'rgba(58,46,32,0.55)';
    tg.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.7), r() < 0.3 ? 2 : 1, 1);
  }
  oval(x, y, rad, ry, 'rgba(106,88,62,0.6)');
  oval(x - rad * 0.08, y - ry * 0.06, rad * 0.78, ry * 0.76, 'rgba(30,24,17,0.78)');
  oval(x + rad * 0.2, y + ry * 0.08, rad * 0.48, ry * 0.44, 'rgba(84,67,48,0.5)');
  oval(x - rad * 0.06, y, rad * 0.36, ry * 0.3, 'rgba(16,12,8,0.6)');
}
// Painted into the ground so that on screen it looks just as it did standing on the battle view (iso view): fn draws
// as on the view (sprites, pixels and lines upright at their spots, uprightCtx) into a scratch picture seen through the
// view's turn and squash, and that picture goes into the ground through the inverse, which the ground's own transform
// undoes. Before, a wreck was rendered flat from straight above and a body's pixels and a turret's picture were laid
// in world coordinates, so on the turned, squashed ground they showed as dark slabs and smears.
// R: half the scratch picture's size, in screen pixels (the world box it can reach is about R / VIEW.F each way).
let standPic = null;
// HD ground (tg._gk, set by makeGround's markPic): the scratch picture at the ground's pixels per world pixel, and the
// pictures in it the HD ones (charred, dimmed keep them), so a wreck is as sharp as the units.
function standOnGround(tg, x, y, R, fn) {
  const K = tg._gk || 1, S = 2 * R, SK = S * K;
  if (!standPic || standPic.width < SK) standPic = mkCanvas(SK, SK);
  const g = uprightCtx(standPic.getContext('2d')), c = VIEW.c, s = VIEW.s, F = VIEW.F;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, standPic.width, standPic.height);
  g.setTransform(K * c, K * s * F, -K * s, K * c * F, K * (R - (c * x - s * y)), K * (R - (s * F * x + c * F * y)));
  g.upright = true; g._px = K;
  try { fn(g); } finally { g.upright = false; g._px = 1; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.setTransform(1, 0, 0, 1, 0, 0); }
  tg.save();
  tg.translate(x, y); tg.transform(c, -s, s / F, c / F, 0, 0);
  tg.imageSmoothingEnabled = K > 1;   // (restored with the rest; HD ground: the picture is at the ground's own scale, but turned)
  tg.drawImage(standPic, 0, 0, SK, SK, -R, -R, S, S);
  tg.restore();
}
// A burnt-out wreck painted into the ground, so it stays for the rest of the battle: the burning hull as it stood (drawHusk).
// seed: the char pattern (given by the marks list, so a tile painted again shows the same wreck).
function bakeWreck(tg, x, y, def, face, tface, noTurret, seed = (Math.random() * 1e6) | 0) {
  const fake = { def, face, tface, load: 0 };
  const hs = hullSprite(fake, BURNT), ts = !noTurret && turretSprite(fake, BURNT);
  standOnGround(tg, x, y, 48, (g) => {
    if (hs.sh) { g.globalAlpha = 0.45; g.drawImage(hs.sh, Math.round(x + hs.sox), Math.round(y + hs.soy)); g.globalAlpha = 1; }
    g.drawImage(charred(hs.img, seed), Math.round(x + hs.ox), Math.round(y + hs.oy));
    if (ts) { const [tx, ty] = liftPt(x, y, turretZ(def) * VK); g.drawImage(charred(ts.img, seed + 1), Math.round(tx + ts.ox), Math.round(ty + ts.oy)); }
  });
}
// A turret blown off by a cook-off, charred, at its height above the ground and turned by rot.
function turretImg(fx) {
  if (!fx.img) fx.img = charred(turretSprite({ def: fx.def, tface: fx.tface }, BURNT).img, fx.seed);
  return fx.img;
}
function drawTurretAt(g, fx, z) {
  const img = turretImg(fx);
  const [tx, ty] = liftPt(fx.x, fx.y, z + 3);
  g.save(); g.translate(Math.round(tx), Math.round(ty)); g.rotate(fx.rot);
  g.drawImage(img, -Math.round(picW(img) / 2), -Math.round(picH(img) / 2));
  g.restore();
}
function bakeTurret(tg, fx) {
  tg.fillStyle = 'rgba(0,0,0,0.35)';
  tg.beginPath(); tg.ellipse(fx.x + 2, fx.y + 1, 9, 4, 0, 0, 7); tg.fill();
  standOnGround(tg, fx.x, fx.y, 24, (g) => drawTurretAt(g, fx, 0));
}
// A fallen soldier: the unit's own sprite tipped onto its side, a shade darker, over a dark stain.
function bakeCorpse(tg, u, seed, angle) {
  const r = rng(seed), s = infSprite({ type: u.type, faction: u.faction, face: u.face }, palFor(u.faction), 0);
  const a = angle !== undefined ? angle : (r() < 0.5 ? -1 : 1) * (Math.PI / 2) + (r() - 0.5) * 0.5, side = Math.sin(a) >= 0 ? 1 : -1;
  const x = Math.round(u.x), y = Math.round(u.y);
  tg.fillStyle = 'rgba(70,14,10,0.5)';
  const k = INF_SCALE;
  tg.beginPath(); tg.ellipse(x + side * 6 * k, y + 1, (6 + r() * 2) * k, 3 * k, 0, 0, 7); tg.fill();
  tg.fillStyle = 'rgba(0,0,0,0.28)';
  tg.beginPath(); tg.ellipse(x + side * 7 * k, y + 2 * k, 9 * k, 3 * k, 0, 0, 7); tg.fill();
  tg.save();
  tg.translate(x, y + 1); tg.rotate(a);
  const img = dimmed(s.img);
  tg.drawImage(img, Math.round(s.ox), Math.round(s.oy), picW(img), picH(img));
  tg.restore();
}
// A ragdoll's body, drawn limb by limb from its joints in the uniform's colours (and its
// loose weapon), nearest the camera last.
const cssOf = (c) => typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c;
function drawRagBody(g, fx) {
  const pal = palFor(fx.faction), K = infKit(pal, fx.faction), P = fx.P, burnt = fx.burnt;
  const tunic = burnt ? BURNT.main : pal.main, sleeve = burnt ? BURNT.dark : cssOf(shadeInt(pal.main, 0.86));
  const pants = burnt ? BURNT.deep : cssOf(K.pants), skin = burnt ? '#3a2e26' : K.skin;
  const head = fx.unitType === 'pilot' ? '#cfcab8' : fx.unitType === 'technician' ? '#4a3a2a' : fx.unitType === 'grenadier' ? '#5d6236' : cssOf(K.helm);
  const L = (i) => liftPt(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), X = (i) => L(i)[0], Y = (i) => L(i)[1], Zk = (i) => P[i * 3 + 2] * 4 + P[i * 3 + 1];
  const parts = [];
  const seg = (i, j, w, col) => parts.push({ k: (Zk(i) + Zk(j)) / 2, f: (dark) => pxLine(g, X(i), Y(i), X(j), Y(j), dark ? w + 1 : w, dark ? '#16120e' : col) });
  seg(2, 7, 1, pants); seg(7, 9, 1, pants); seg(2, 8, 1, pants); seg(8, 10, 1, pants);   // (thin: soldiers are drawn at INF_SCALE)
  seg(1, 2, 2, tunic); seg(3, 4, 2, tunic); seg(3, 5, 1, sleeve); seg(4, 6, 1, sleeve);
  if (fx.gun) {
    const q = fx.gun.P, rk = fx.unitType === 'rocket';
    parts.push({ k: (q[2] + q[5]) * 2 + (q[1] + q[4]) / 2, f: (dark) => pxLine(g, ...liftPt(q[0], q[1], q[2]), ...liftPt(q[3], q[4], q[5]), (rk ? 2 : 1) + (dark ? 1 : 0), dark ? '#16120e' : rk ? '#56603a' : C.gun) });
  }
  parts.sort((a, b) => a.k - b.k);
  for (const p of parts) p.f(true);
  for (const p of parts) p.f(false);
  // Boots, hands, then the head with its helmet on the side away from the neck.
  g.fillStyle = '#121210';
  for (const i of [9, 10]) g.fillRect(Math.round(X(i) - 1), Math.round(Y(i) - 1), 2, 2);
  g.fillStyle = skin;
  for (const i of [5, 6]) g.fillRect(Math.round(X(i)), Math.round(Y(i)), 1, 1);
  const hx = X(0), hy = Y(0), ux = hx - X(1), uy = hy - Y(1), ul = Math.hypot(ux, uy) || 1;
  g.fillStyle = '#16120e'; g.fillRect(Math.round(hx - 1.5), Math.round(hy - 1.5), 3, 3);
  g.fillStyle = skin; g.fillRect(Math.round(hx - 1), Math.round(hy - 1), 2, 2);
  g.fillStyle = burnt ? BURNT.light : head;
  g.fillRect(Math.round(hx + ux / ul - 1), Math.round(hy + uy / ul - 1), 2, 2);
}
// A pool of blood spreading from under the chest: a few overlapping blots, darker at the edge,
// with a glint of wet highlight. k runs from 0 (just started) to 1 (full size).
function drawPool(g, fx, k) {
  const P = fx.P, pl = fx.pool, r = rng(pl.seed), s = pl.r * (1 - (1 - k) * (1 - k));
  if (s < 0.6) return;
  // Centred under the chest but running out to one side, as blood pools away from a body.
  const cx = (P[3] + P[6]) / 2 * 0.6 + P[6] * 0.4 + Math.cos(pl.a) * s * 0.75, cy = (P[4] + P[7]) / 2 * 0.6 + P[7] * 0.4 + Math.sin(pl.a) * s * 0.55;
  const blots = [];
  for (let i = 0; i < 6; i++) blots.push([(r() - 0.5) * s * 1.1, (r() - 0.5) * s * 0.7, s * (0.45 + r() * 0.45)]);
  for (const [col, grow] of [['rgba(54,6,6,0.88)', 0.7], ['rgba(106,14,10,0.9)', 0]]) {
    g.fillStyle = col;
    for (const [ox, oy, rr] of blots) { g.beginPath(); g.ellipse(cx + ox, cy + oy, rr + grow, (rr + grow) * 0.62, 0, 0, 7); g.fill(); }
  }
  g.fillStyle = 'rgba(190,70,60,0.5)';
  g.fillRect(Math.round(cx - s * 0.3), Math.round(cy - s * 0.25), s > 3 ? 2 : 1, 1);
}
// Pixel-crisp line with a square brush.
function pxLine(g, x0, y0, x1, y1, w, col) {
  g.fillStyle = col;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
    g.fillRect(Math.round(x - w / 2), Math.round(y - w / 2), w, w);
  }
}
// A settled ragdoll painted into the ground for good: a dark stain, then the body a shade dimmer.
function bakeRagdoll(tg, fx) {
  drawVar = fx.v | 0;
  const P = fx.P, cx = Math.round(P[6]), cy = Math.round(P[7]), R = 26;
  if (fx.pool) drawPool(tg, fx, 1);
  else {   // a scorched patch under a burnt body
    tg.fillStyle = 'rgba(20,16,12,0.45)';
    tg.beginPath(); tg.ellipse((P[3] + P[6]) / 2, (P[4] + P[7]) / 2 + 1, 5, 3, Math.atan2(P[4] - P[7], P[3] - P[6]), 0, 7); tg.fill();
  }
  standOnGround(tg, cx, cy, R, (g) => {   // the body as it lay on the view (drawEffect 'ragdoll'), a shade dimmer
    drawRagBody(g, fx);
    g.upright = false; g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(20,16,12,0.28)'; g.fillRect(0, 0, R * 2 * (g._px || 1), R * 2 * (g._px || 1));
  });
}
function dimmed(img) {
  img = GK > 1 ? img : sdPic(img);   // (HD ground: kept at its own pixels, _k)
  const c = mkCanvas(img.width, img.height), g = c.getContext('2d');
  if (img._k > 1) c._k = img._k;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(20,16,12,0.28)'; g.fillRect(0, 0, c.width, c.height);
  return c;
}

// Blackened, soot-streaked copy of a sprite, with a few rust patches.
// The charred look of a wreck's sprite: one of CHAR_LOOKS per sprite, kept (it was a new canvas and hundreds of
// small fills for every wreck, each time a tile with wrecks was painted again: a stall on iPhones).
const CHAR_LOOKS = 4, charMemo = new WeakMap();
function charred(img, seed) {
  let looks = charMemo.get(img);
  if (!looks) charMemo.set(img, looks = []);
  const v = ((seed % CHAR_LOOKS) + CHAR_LOOKS) % CHAR_LOOKS;
  return looks[v] || (looks[v] = charredLook(img, v * 7919 + 13));
}
function charredLook(img, seed) {
  img = GK > 1 ? img : sdPic(img);   // (painted into the ground, at one pixel per world pixel; HD ground: at its own, _k)
  const r = rng(seed), c = mkCanvas(img.width, img.height), g = c.getContext('2d');
  c._ox = img._ox; c._oy = img._oy;   // (still a sprite to uprightCtx)
  if (img._k > 1) c._k = img._k;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(22,18,14,0.62)'; g.fillRect(0, 0, c.width, c.height);
  const ck = c._k || 1;   // (HD: the soot flecks at world size, as before)
  for (let i = 0; i < c.width * c.height / 14 / (ck * ck); i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? 'rgba(8,6,4,0.55)' : v < 0.8 ? 'rgba(96,52,26,0.45)' : 'rgba(120,112,100,0.3)';
    g.fillRect(((r() * c.width / ck) | 0) * ck, ((r() * c.height / ck) | 0) * ck, (1 + (r() * 2 | 0)) * ck, ck);
  }
  return c;
}

// Worn earth around a structure, like the dirt aprons of classic bases.
function bibDecal(tg, x, y, w, h, seed, type) {   // type: the structure's (look.js concreteDecal; older marks have none)
  if (typeof LOOK !== 'undefined' && LOOK.concrete) return concreteDecal(tg, x, y, w, h, seed, type);   // (look.js prototype, off by default)
  const r = rng(seed), M = 9;
  const tones = snowy() ? [[92, 90, 88], [108, 105, 102], [124, 122, 119], [142, 140, 138]] : [[66, 56, 42], [79, 67, 49], [92, 78, 57], [105, 90, 66]];   // winter: trodden slush
  // Worked out as pixels and drawn in one go (a pixel at a time, a large pad took 15 ms on a slow phone).
  const W = w + 2 * M, H = h + 2 * M;
  if (!bibPic || bibPic.width < W || bibPic.height < H) bibPic = mkCanvas(Math.max(W, bibPic ? bibPic.width : 0), Math.max(H, bibPic ? bibPic.height : 0));   // one picture, kept
  const c = bibPic, g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let py = y - M, q = 0; py < y + h + M; py++) for (let px = x - M; px < x + w + M; px++, q += 4) {
    const dx = Math.max(x - px, 0, px - (x + w - 1)), dy = Math.max(y - py, 0, py - (y + h - 1));
    const dd = Math.hypot(dx, dy) / M;
    if (r() < 1.05 - dd * 1.1) { const t = tones[Math.floor(r() * 4)]; d[q] = t[0]; d[q + 1] = t[1]; d[q + 2] = t[2]; d[q + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  tg.drawImage(c, 0, 0, W, H, x - M, y - M, W, H);
}
let bibPic = null;
// A Service Depot's repair pad, painted on the ground in front of it: concrete inside a yellow and
// black border, with a white cross.
function padDecal(tg, x, y) {
  if (typeof LOOK !== 'undefined' && LOOK.hills) return;   // (look test: on raised ground the flat pad sat crooked under the depot; owner: remove it)
  tg.fillStyle = '#6b6b63'; tg.fillRect(x, y, CELL, CELL);
  for (let i = 0; i < CELL; i++) for (const [px, py] of [[x + i, y], [x + i, y + CELL - 1], [x, y + i], [x + CELL - 1, y + i]]) {
    tg.fillStyle = ((px + py) >> 1) % 2 ? '#d8b13a' : '#1d1d1a'; tg.fillRect(px, py, 1, 1);
  }
  tg.fillStyle = '#d9d6c8'; tg.fillRect(x + 10, y + 5, 4, 14); tg.fillRect(x + 5, y + 10, 14, 4);
}
function rubble(tg, x, y, w, h, seed) {
  const r = rng(seed), cx = x + w / 2, cy = y + h / 2;
  for (let i = 0; i < (w * h) / 9; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const px = cx + Math.cos(a) * d * w * 0.5, py = cy + Math.sin(a) * d * h * 0.5;
    tg.fillStyle = d < 0.6 ? 'rgba(28,24,20,0.35)' : 'rgba(40,34,26,0.2)';
    tg.fillRect(Math.round(px), Math.round(py), 3, 2);
  }
  for (let i = 0; i < (w * h) / 30; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.8;
    const px = Math.round(cx + Math.cos(a) * d * w * 0.5), py = Math.round(cy + Math.sin(a) * d * h * 0.5), s = 1 + Math.floor(r() * 3);
    tg.fillStyle = 'rgba(0,0,0,0.4)'; tg.fillRect(px + 1, py + 1, s + 1, s);
    tg.fillStyle = ['#7d7a71', '#5b5850', '#949086', '#6b5440', '#8f8c84'][Math.floor(r() * 5)];
    tg.fillRect(px, py, s + 1, s);
    tg.fillStyle = 'rgba(255,255,255,0.18)'; tg.fillRect(px, py, s + 1, 1);
  }
  // A few twisted girders.
  tg.strokeStyle = 'rgba(60,50,40,0.8)'; tg.lineWidth = 1;
  for (let i = 0; i < Math.max(2, w / 24); i++) {
    const sx = x + 6 + r() * (w - 12), sy = y + 6 + r() * (h - 12);
    tg.beginPath(); tg.moveTo(sx, sy); tg.lineTo(sx + (r() - 0.5) * 14, sy + (r() - 0.5) * 8); tg.stroke();
  }
}

// ---------------------------------------------------------------------------
// Weather (looks only: it changes nothing in the battle, so single player and online play the same)
// ---------------------------------------------------------------------------
// A map with `weather` in MAPS ({ kind: 'rain' | 'snow', chance }) rolls once per battle, from the battle's seed, so
// both phones of an online battle get the same. It comes and goes in spells, light to heavy (weatherLevel).
function rollWeather(mapId, seed) {
  const w = MAPS[validMap(mapId)].weather;
  if (!w) return null;
  const r = rng(Math.imul((seed | 0) ^ 0x3c6ef372, 0x85ebca6b) ^ 0x1b873593); r(); r();
  return r() < w.chance ? { kind: w.kind, seed: (r() * 1e9) | 0 } : null;
}
// How hard it is raining or snowing at battle time t: 0.2 (a drizzle, a few flakes) to 1, changing over a minute or two.
function weatherLevel(w, t) {
  if (w.lvl !== undefined) return w.lvl;   // (look test: a storm's stand-in weather, lookstorm.js)
  const h = (i) => { let x = Math.imul(i, 374761393) ^ Math.imul(w.seed, 668265263); x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const f = t / 70, i = Math.floor(f), u = f - i, s = u * u * (3 - 2 * u);
  return 0.2 + 0.8 * (h(i) + (h(i + 1) - h(i)) * s);
}
// The trees, drawn live over the ground (they are not painted into it): each sways with the wind (windNow in
// world.js), harder in rain or snow, and a gust runs across the woods downwind. A tree caught in an explosion
// burns (G.treeFire, world.js treeFires) and is left a burnt tree. g: the view, already translated to the world;
// draws the trees whose base is between y0 and y1 and x0 and x1. Looks only.
const TREE_BURN = 9;   // seconds a tree burns before it is a bare, burnt tree
// How fiercely a tree burns at p (0 to 1 of TREE_BURN): it is ablaze within a second or so, roars, and dies down over the last third.
function treeHeat(p) { const a = p * TREE_BURN; return Math.max(0, Math.min(1, a / 1.2, (TREE_BURN - a) / 3)); }
// A tree's shape in flame: each of its pixels yellow, orange or red, with gaps, in TREE_FLAME_FRAMES pictures whose
// pattern rises up the tree from one to the next. Made once per tree picture.
const TREE_FLAME_FRAMES = 4, treeFlameCache = new WeakMap();
function treeFlames(spr) {
  let fr = treeFlameCache.get(spr);
  if (fr) return fr;
  const W = spr.img.width, H = spr.img.height, src = spr.img.getContext('2d').getImageData(0, 0, W, H).data;
  const hsh = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h ^= h >>> 13; return ((h >>> 0) % 1000) / 1000; };
  fr = [];
  for (let k = 0; k < TREE_FLAME_FRAMES; k++) {
    const c = mkCanvas(W, H), g = c.getContext('2d'), im = g.createImageData(W, H), d = im.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (src[i + 3] < 100) continue;
      // Tongues: columns of flame that move up a few pixels each frame, brightest low down and at their cores.
      const n = hsh(x, (y + k * 3) >> 1) * 0.6 + hsh(x >> 1, (y + k * 3) >> 2) * 0.4, up = y / H;
      if (n < 0.3 + 0.3 * (1 - up)) continue;   // gaps, more of them near the top
      const v = n * 0.9 + up * 0.3 - 0.1;
      const col = v > 0.95 ? [255, 244, 190] : v > 0.78 ? [255, 214, 90] : v > 0.58 ? [255, 150, 40] : v > 0.4 ? [236, 88, 24] : [170, 40, 16];
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 235;
    }
    g.putImageData(im, 0, 0);
    fr.push(c);
  }
  treeFlameCache.set(spr, fr);
  return fr;
}
// Trees (iso view): treesInView draws the shadows of the trees in the world box and returns the trees, which ui.js sorts
// in with the units and draws one at a time with drawTree, so a tank in front of a wood is in front of it.
let treeFrame = null;   // what every tree drawn this frame shares (wind, gusts, the camera's transform)
function treesInView(g, x0, y0, x1, y1, keep, noShadow) {   // keep(x, y): whether a tree shows on the screen; noShadow: the caller draws them (isoTreeBlocks)
  const T = G.ground && G.ground.trees, out = [];
  let lo = 0, hi = T ? T.length : 0;   // the first tree at y0 or below (they are sorted by y)
  while (lo < hi) { const m = (lo + hi) >> 1; if (T[m].y < y0) lo = m + 1; else hi = m; }
  const fire = G.treeFire || null, t = G.t, w = windNow(), ws = Math.hypot(w.x, w.y) || 1;
  const storm = G.weather ? weatherLevel(G.weather, t) : 0, force = ws / WIND * (1 + 1.6 * storm);
  // The lean is across the screen: the part of the wind that blows left or right as the camera sees it.
  const sx = toView(w.x, w.y)[0], lean = sx / WIND * 0.045 * (1 + storm), ux = w.x / ws, uy = w.y / ws;
  treeFrame = { t, force, lean, ux, uy, tf: g.getTransform() };
  if (!T || !T.length) return out;   // (treeFrame is still set: the woods past the map's edge use it)
  for (let i = lo; i < T.length && T[i].y < y1; i++) {
    const tr = T[i];
    if (tr.x < x0 || tr.x > x1 || (keep && !keep(tr.x, tr.y))) continue;
    const f = fire && fire[i] !== undefined ? fire[i] : null, p = f === null ? 0 : Math.max(0, Math.min(1, (t - f) / TREE_BURN));
    out.push({ kind: 'tree', x: tr.x, y: tr.y, tr, p, i });
  }
  if (!noShadow) treeShadows(g, out);   // shadows first (they stay put)
  return out;
}
function drawTree(g, e) {
  const { tr, p, i } = e, F = treeFrame, t = F.t, tf = F.tf;
  // The lean: a steady bend downwind, a gust rolling across the woods with the wind, and a little flutter.
  const ph = (i * 2.399) % 6.283, along = (tr.x * F.ux + tr.y * F.uy) * 0.025;
  const sway = F.lean + F.force * (0.045 * Math.sin(t * 0.8 - along + ph * 0.3) + 0.01 * Math.sin(t * 2 + ph));
  const stiff = (tr.pine ? 0.7 : 1) * (1 - 0.65 * p), c = -sway * stiff;   // burnt trees hardly move
  // A shear on the screen about the tree's foot: the top moves, the foot stays. Drawn with the canvas's own drawImage,
  // so the shear is kept (uprightCtx would set it aside).
  const fx = Math.round(tf.a * tr.x + tf.c * tr.y + tf.e), fy = Math.round(tf.b * tr.x + tf.d * tr.y + tf.f - gLift(tr.x, tr.y));   // (on the raised ground: look.js)
  const draw = (img, ox, oy, dy) => (g._rawDraw || CanvasRenderingContext2D.prototype.drawImage).call(g, img, fx + Math.round(ox), fy + Math.round(oy) + (dy || 0));   // (_rawDraw: gl.js's recorder)
  // (No save() / restore(): thousands of trees show zoomed out on a big screen. What is changed is put back below.)
  g.setTransform(1, 0, c, 1, -c * fy, 0);
  if (p < 1) { g.globalAlpha = 1 - p * p; draw(tr.s.img, tr.s.ox, tr.s.oy); }
  if (p > 0) { g.globalAlpha = Math.min(1, p * 1.6); draw(tr.burnt.img, tr.burnt.ox, tr.burnt.oy); }
  if (p > 0 && p < 1) {   // engulfed: the tree's own shape in flickering flame, then a glow round it
    const heat = treeHeat(p), src = p < 0.5 ? tr.s : tr.burnt, fr = treeFlames(src)[Math.floor(t * 12 + ph * 3) % TREE_FLAME_FRAMES];
    g.globalAlpha = 0.95 * heat;
    draw(fr, src.ox, src.oy);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.18 * heat; draw(fr, src.ox, src.oy, -1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 0.12 * heat * (0.8 + 0.2 * Math.sin(t * 13 + ph)); g.fillStyle = '#ff6a18';
    const fs = g.fillStyle;
    g.beginPath(); g.ellipse(fx, fy - 14, 14, 15, 0, 0, 7); g.fill();
    g.fillStyle = fs; g.globalCompositeOperation = 'source-over';
  }
  g.globalAlpha = 1; g.setTransform(tf);
}
// Far views (many trees on screen, as on a big PC screen zoomed out): still trees are drawn from cached blocks of the view
// plane instead of one at a time. Each TREE_BLOCK px square of the view plane holds the shadows, then the trees (living
// or burnt, upright, without the sway) of every tree whose foot is in it, back to front, drawn with the game's own code
// (the shadow the way treesInView draws it, the tree with drawTree), so a block looks as the trees would standing still.
// Blocks are drawn before the units (so a unit passing behind a tree shows in front of it: only in far views). A
// burning tree stays out of its block and is drawn one by one as before; a block is redrawn when one of its trees catches
// fire or burns out. Blocks are made for up to TREE_BLOCK_MS a frame (at least TREE_BLOCK_BUILD); the trees of one not
// made yet are drawn one by one. A block takes about a millisecond: with only three a frame, a jump across the map (a
// minimap tap) drew 2,000 to 3,500 trees one by one, with their shadows, for a dozen frames (match ea39d315: frames of
// 70 to 100 ms in big fights on a PC). Blocks unused for TREE_BLOCK_KEEP ms are dropped, and beyond twice the blocks a
// screen shows (at least 24) the least recently used, so a look elsewhere and back finds them still made.
// The view plane is the same at every zoom (ui.js draws it at zoom 1, then scales).
const TREE_BLOCK = 512, TREE_BLOCK_PAD = 64, TREE_FAR_N = 700, TREE_NEAR_N = 550, TREE_BLOCK_BUILD = 3, TREE_BLOCK_MS = 5, TREE_BLOCK_KEEP = 30000;
let treeBlocks = null, treeFar = false;   // { trees, rim, map: key -> { idx: [[list, i]], c, sig, used } }
function treeKey(x, y) { const [X, Y] = toView(x, y); return Math.floor(Y / TREE_BLOCK) * 65536 + Math.floor(X / TREE_BLOCK) + 32768; }
// The shadows of a list of trees (from treesInView / rimInView), the living tree's fading as it burns.
function treeShadows(g, list) {
  for (const { tr, p } of list) onHill(g, tr.x, tr.y, () => {   // (on the raised ground: look.js)
    if (p < 1) { g.globalAlpha = 0.45 * (1 - p); g.drawImage(tr.s.sh, Math.round(tr.x + tr.s.sox), Math.round(tr.y + tr.s.soy)); }
    if (p > 0) { g.globalAlpha = 0.45 * p; g.drawImage(tr.burnt.sh, Math.round(tr.x + tr.burnt.sox), Math.round(tr.y + tr.burnt.soy)); }
  });
  g.globalAlpha = 1;
}
// list: the trees on screen (treesInView, rimInView). Draws the shadows of the trees it does not hand back; returns the
// trees still to be drawn one by one (sorted in with the units). g is the view canvas in its world transform; (vx, vy)
// its top left on the view plane.
function isoTreeBlocks(g, list, rim, vx, vy, VW, VH) {
  const n = list.length;
  treeFar = treeFar ? n > TREE_NEAR_N : n > TREE_FAR_N;
  const T = G.ground && G.ground.trees;
  if (!treeFar || !T || (LOOK.hills && G.hgt)) { treeShadows(g, list); dropTreeBlocks(); return list; }   // (raised ground, look.js: trees one by one, so hills can hide them)
  if (!treeBlocks || treeBlocks.trees !== T || treeBlocks.rim !== rim) {
    const map = new Map(), add = (src, tr, i, k) => { let b = map.get(k); if (!b) map.set(k, b = { idx: [], c: null, sig: -1, used: 0 }); b.idx.push([src, i]); };
    T.forEach((tr, i) => add(T, tr, i, treeKey(tr.x, tr.y)));
    (rim || []).forEach((tr, i) => add(rim, tr, i, treeKey(tr.x, tr.y)));
    for (const b of map.values()) b.idx.sort((a, b2) => { const ta = a[0][a[1]], tb = b2[0][b2[1]]; return viewDepth(ta.x, ta.y) - viewDepth(tb.x, tb.y); });
    treeBlocks = { trees: T, rim, map };
  }
  const fire = G.treeFire || null, t = G.t, now = performance.now();
  const state = (src, i) => { if (src !== T || !fire || fire[i] === undefined) return 0; return t - fire[i] >= TREE_BURN ? 2 : 1; };
  let built = 0, shown = 0;
  const ready = new Set(), m = g.getTransform(), t0 = performance.now();
  const bx0 = Math.floor((vx - TREE_BLOCK_PAD) / TREE_BLOCK), bx1 = Math.floor((vx + VW + TREE_BLOCK_PAD) / TREE_BLOCK);
  const by0 = Math.floor((vy - TREE_BLOCK_PAD) / TREE_BLOCK), by1 = Math.floor((vy + VH + TREE_BLOCK_PAD * 3) / TREE_BLOCK);
  const order = [];
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
    const key = by * 65536 + bx + 32768, b = treeBlocks.map.get(key);
    if (!b) continue;
    let sig = 0;
    if (fire) for (const [src, i] of b.idx) sig = (sig * 3 + state(src, i)) % 1000000007;
    if (!b.c || sig !== b.sig) {
      if (built >= TREE_BLOCK_BUILD && performance.now() - t0 > TREE_BLOCK_MS) continue;   // not made yet: its trees are drawn one by one this frame
      built++;
      b.sig = sig;
      const S = TREE_BLOCK + 2 * TREE_BLOCK_PAD;
      if (!b.c) b.c = mkCanvas(S, S);
      const c = uprightCtx(b.c.getContext('2d')), ox = bx * TREE_BLOCK - TREE_BLOCK_PAD, oy = by * TREE_BLOCK - TREE_BLOCK_PAD;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S, S);
      c.setTransform(VIEW.c, VIEW.s * VIEW.F, -VIEW.s, VIEW.c * VIEW.F, -ox, -oy);   // world -> this block (as ui.js toWorld)
      c.upright = false; c.imageSmoothingEnabled = false;
      const still = b.idx.filter(([src, i]) => state(src, i) !== 1).map(([src, i]) => ({ tr: src[i], p: state(src, i) === 2 ? 1 : 0, i: src === T ? i : 90000 + i }));
      treeShadows(c, still);
      const keep = treeFrame;
      treeFrame = { t, force: 0, lean: 0, ux: 1, uy: 0, tf: c.getTransform() };   // standing still
      for (const e of still) drawTree(c, e);
      treeFrame = keep;
    }
    b.used = now; ready.add(key); order.push(b, bx, by);
  }
  shown = (bx1 - bx0 + 1) * (by1 - by0 + 1);
  g.setTransform(1, 0, 0, 1, -vx, -vy);   // view plane
  for (let k = 0; k < order.length; k += 3) (g._rawDraw || CanvasRenderingContext2D.prototype.drawImage).call(g, order[k].c, order[k + 1] * TREE_BLOCK - TREE_BLOCK_PAD, order[k + 2] * TREE_BLOCK - TREE_BLOCK_PAD);
  g.setTransform(m);
  // The rest: burning trees, and trees of blocks not made yet.
  const rest = list.filter((e) => e.p > 0 && e.p < 1 || !ready.has(treeKey(e.x, e.y)));
  treeShadows(g, rest);
  dropTreeBlocks(Math.max(24, shown * 2));
  return rest;
}
function dropTreeBlocks(most = Infinity) {   // blocks no far view has used for TREE_BLOCK_KEEP, and the oldest beyond `most`
  if (!treeBlocks) return;
  const now = performance.now(), made = [];
  for (const b of treeBlocks.map.values()) if (b.c) { if (now - b.used > TREE_BLOCK_KEEP) b.c = null; else made.push(b); }
  if (made.length > most) { made.sort((a, b) => a.used - b.used); for (let i = 0; i < made.length - most; i++) made[i].c = null; }
}
// Lightning in rain: now and then, more often the heavier it rains (none in a drizzle), the sky flashes and thunder
// follows a moment later. When it strikes is worked out from the weather's seed and the battle clock, so every phone of
// an online battle flashes at the same moment. About a third of strikes also come down as a bolt somewhere on the map
// and set it alight (world.js lightningStrikes; drawn as the 'bolt' effect). Players who ask for less motion get no flash.
const calmFlash = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const LIGHTNING_RATE = 0.05;   // strikes a second in the heaviest rain (about one every 20 s)
function lightningAt(w, slot) {   // [strike time within the second, or -1; and two numbers for its look]
  if (typeof G !== 'undefined' && G && MAPS[validMap(G.mapId)].lightning === false) return null;   // (a map whose rain brings none: Heron Fen)
  let h = Math.imul((w.seed | 0) ^ 0x5bd1e995, 0x27d4eb2d) + Math.imul(slot, 0x165667b1);
  const r = rng(h ^ (h >>> 15)); r();
  const L = weatherLevel(w, slot), p = L < 0.45 ? 0 : LIGHTNING_RATE * (L - 0.45) / 0.55;
  return r() < p ? [r(), r(), r(), r()] : null;   // when in the second, two for the flash and thunder, one for whether a bolt lands (world.js)
}
function lightning(g, w, t, k, paused) {
  const F = weatherFx, W = g.canvas.width, H = g.canvas.height;   // (k: screen pixels a world pixel)
  if (!paused && F.lt !== undefined && t > F.lt && t - F.lt < 2) {
    for (let s = Math.floor(F.lt); s <= Math.floor(t); s++) {
      const hit = lightningAt(w, s);
      if (!hit || s + hit[0] <= F.lt || s + hit[0] > t) continue;
      F.bolt = { born: performance.now() };
      if (typeof Sound !== 'undefined') setTimeout(() => Sound.play('thunder', 0.55 + 0.45 * hit[2], hit[1] * 1.2 - 0.6, 0), 250 + hit[1] * 1600);
    }
  }
  F.lt = t;
  const B = F.bolt;
  if (!B) return;
  const age = (performance.now() - B.born) / 1000;
  if (age > 0.6) { F.bolt = null; return; }
  // The flash: bright at once, a second flicker, then gone.
  const flash = age < 0.08 ? 1 : age < 0.14 ? 0.25 : age < 0.22 ? 0.8 : Math.max(0, 0.8 * (1 - (age - 0.22) / 0.38));
  if (!calmFlash) { g.fillStyle = `rgba(226,232,255,${(0.32 * flash).toFixed(3)})`; g.fillRect(0, 0, W, H); }
}
// Draws the weather over the battle on the screen canvas g: the view's top left at world (vx, vy), vw x vh world
// pixels, k screen pixels a world pixel. Drops and flakes live in the world (they stay put as the camera moves) and
// wrap round the view.
const weatherFx = { parts: [], splash: [], last: 0, kind: null };
// Day and night (maps with `daynight`, looks only): a day of DAY_LEN seconds of battle clock, so every phone has the same
// hour. A battle starts in the morning; dusk comes after about 5 minutes, the night lasts about 5, then dawn.
const DAY_LEN = 720, DAY_START = 0.3;   // DAY_START: the hour a battle begins, as a share of the day (0 midnight, 0.5 noon)
// The hour at battle time t, as a share of the day; on a map with `clock` (Heron Fen's night) it stands still.
function dayPhase(t) {
  const M = typeof G !== 'undefined' && G && MAPS[validMap(G.mapId)];
  return M && M.clock !== undefined ? M.clock : (t / DAY_LEN + DAY_START) % 1;
}
function dayNight(t) {
  if (!G || !MAPS[validMap(G.mapId)].daynight) return { night: 0, warm: 0 };
  const p = dayPhase(t), sun = Math.sin((p - 0.25) * Math.PI * 2);   // 1 at noon, -1 at midnight
  return { night: Math.max(0, Math.min(1, (0.12 - sun) / 0.42)), warm: Math.max(0, 1 - Math.abs(sun - 0.02) / 0.3) };
}
const nightLevel = () => dayNight(G ? G.t : 0).night;
// Darkness over the view, with holes where there is light, then the lights' warm glow on top. Dusk and dawn tint it amber.
let nightCv = null, lightPic = null;
const NIGHT_RES = 0.5;   // the night layer's size as a share of the screen's (see drawNight)
function nightLightPic() {   // a light's soft hole in the darkness (also gl.js's light pass)
  if (!lightPic) {
    lightPic = mkCanvas(64, 64);
    const c = lightPic.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  }
  return lightPic;
}
function drawNight(g, vx, vy, vw, vh, k, t, vis) {
  const { night, warm } = dayNight(t);
  const W = g.canvas.width, H = g.canvas.height;
  if (warm > 0.01) {
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(255,170,110,${(0.32 * warm).toFixed(3)})`; g.fillRect(0, 0, W, H); g.restore();
  }
  if (night < 0.01) return;
  nightLightPic();
  // The darkness is soft shade and blurred pools of light, so it is drawn at NIGHT_RES of the screen and stretched up
  // smoothly: on a 3x phone the full-size layer cost about 8 ms of GPU time a frame (match 3c189abc: 60 to about 43 fps at night).
  const nW = Math.max(1, Math.round(W * NIGHT_RES)), nH = Math.max(1, Math.round(H * NIGHT_RES)), nk = k * nW / W;
  if (!nightCv || nightCv.width !== nW || nightCv.height !== nH) nightCv = mkCanvas(nW, nH);
  const n = nightCv.getContext('2d'), lights = nightLights(vx, vy, vw, vh, night);
  const near = (x, y, m) => x > vx - m && y > vy - m && x < vx + vw + m && y < vy + vh + m;
  n.globalCompositeOperation = 'source-over'; n.clearRect(0, 0, nW, nH);
  drawNightRest(g, vx, vy, k, t, night, near, vis, n, nW, nH, nk, W, H, lights);
}
// drawNight's lights, as [view x, view y, radius, strength, warm] (also read by gl.js's light pass): street lamps, the
// look's pools, lit windows, structures (not defences, with the look's lamps), fires, blasts and bolts.
function nightLights(vx, vy, vw, vh, night) {
  const lights = [];
  const near = (x, y, m) => x > vx - m && y > vy - m && x < vx + vw + m && y < vy + vh + m;
  const add = (x, y, r, a, warmLight, h) => { [x, y] = toView(...liftPt(x, y, (h || 0) + gLift(x, y))); if (near(x, y, r)) lights.push([x, y, r, a, warmLight]); };   // (vx, vy: the camera on the view plane)
  // Street lamps, lit windows, buildings' own lights, fires and blasts.
  for (const p of G.props || []) if (p.k === 'lamp' && p.up) add(p.x + 4.5, p.y, 52, 1, true, 8);
  if (typeof lookNightLights === 'function') lookNightLights(add, night);   // (look.js test: lamp posts' pools, window spill, ore)
  for (const h of G.houses || []) {
    if (!h.alive || !G.seen[idx(h.cx, h.cy)]) continue;
    const fi = FORT_INFO.get(h.type);
    if (fi && fi.wins) fi.wins.forEach((w, i) => { if ((h.id * 7 + i * 3) % 5 < 3) add(h.cx * CELL + (w.face === 's' ? w.x + 2 : w.x + 1), h.cy * CELL + (w.face === 's' ? w.y + 1 : w.y + 2), 12, 0.8, true, (w.z + 2) * VK); });
  }
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || e.buildT < 1 || !(G.seen[idx(e.cx, e.cy)])) continue;
    if (typeof LOOK !== 'undefined' && LOOK.lamps && e.def.defense) continue;   // (look.js test: defences give off no light, owner)
    add((e.cx + e.w / 2) * CELL, (e.cy + e.h) * CELL - 4, 26 + e.w * 10, 0.75, true);
  }
  for (const fx of G.effects) {
    if (fx.t < 0) continue;
    if (fx.type === 'fire') add(fx.x, fx.y, 34, 0.9, true);
    else if (fx.type === 'expl' && fx.t < fx.life) add(fx.x, fx.y, (fx.size || 8) * 5, 1 - fx.t / fx.life, true);
    else if (fx.type === 'bolt') add(fx.x, fx.y, 260, 1, false);
  }
  for (const b of G.bolts || []) add(b.x, b.y, 50, Math.min(1, b.t / 3), true);
  return lights;
}
function drawNightRest(g, vx, vy, k, t, night, near, vis, n, nW, nH, nk, W, H, lights) {
  n.fillStyle = `rgba(6,12,34,${(0.62 * night).toFixed(3)})`; n.fillRect(0, 0, nW, nH);
  n.globalCompositeOperation = 'destination-out';
  for (const [x, y, r, a] of lights) {
    const flick = 0.92 + Math.random() * 0.08;
    n.globalAlpha = Math.min(1, a * flick); n.drawImage(lightPic, (x - vx - r) * nk, (y - vy - r) * nk, r * 2 * nk, r * 2 * nk);
  }
  n.globalAlpha = 1; n.globalCompositeOperation = 'source-over';
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low'; g.drawImage(nightCv, 0, 0, W, H); g.restore();
  // The warm light itself, faintly, over what it lights.
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const [x, y, r, a, w] of lights) {
    if (!w) continue;
    g.globalAlpha = 0.12 * a * night; g.drawImage(lampGlowPic || lightPic, (x - vx - r * 0.6) * k, (y - vy - r * 0.6) * k, r * 1.2 * k, r * 1.2 * k);
  }
  g.restore();
  navLights(g, vx, vy, k, t, night, near, vis);
}
// Aircraft lights after dark (looks only): steady red and green at the wingtips (port and starboard), a white strobe at the
// tail that double-flashes, and a red beacon that pulses; helicopters a beacon on top and a white tail light. Drawn over
// the darkness in screen pixels; each aircraft keeps its own beat (its id).
// Wingtip (x back, half span, height), tail strobe on the fin top and the beacon on the spine, in model voxels.
// The paratrooper transports too: the C-130's straight wing (tips 24 out, level with the wing root) and the Il-76's swept,
// drooping wing (tips well back and lower), each with its fin top (the Il-76's T-tail).
const PLANE_LIGHTS = { b1: { tip: [-13.5, 17.5, 4.5], tail: [-20, 12.5], top: [-2, 7.4] }, tu22: { tip: [-11.5, 17.5, 5.5], tail: [-20, 14.5], top: [-2, 7.4] },
  c130: { tip: [1.5, 24, 8.5], tail: [-19.5, 15], top: [-6, 8] }, il76: { tip: [-8.5, 25, 6.5], tail: [-21, 16.5], top: [-6, 8.2] },
  a50: { tip: [-8.5, 25, 6.5], tail: [-21, 16.5], top: [5, 7.9] },   // the A-50's beacon is forward of its rotodome (which covers x -15 to -1)
  sr71: { tip: [-13, 11, 3.5], tail: [-21, 3.4], top: [1, 4.9] } };
function navLights(g, vx, vy, k, t, night, near, vis) {
  const pts = [];
  for (const u of G.entities) {
    if (!u.alive || u.cls !== 'air' || (vis && !vis(u))) continue;
    // alt: over the raised ground too (gLift), as ui.js draws the aircraft (onHill): without it the lights stayed down at the
    // flat ground's height under a plane or helicopter over a hill, or landed on a raised Airfield (owner, 2026-11-22)
    const alt = (u.alt || 0) + gLift(u.x, u.y), c = Math.cos(u.face), s = Math.sin(u.face), heli = u.def.fly === 'heli', r = u.def.r || 9;
    const ph = (t + u.id * 0.37) % 1.3, at = (f, l, h) => { const [x, y] = toView(...liftPt(u.x + c * f - s * l, u.y + s * f + c * l, alt + h)); return [x, y]; };
    const put = (p, col, a, R) => { if (a > 0.02 && near(p[0], p[1], 20)) pts.push([p[0], p[1], col, a, R]); };
    if (heli) {
      put(at(-r * 1.5, 0, 3), '255,250,235', 0.85, 2.5);                                    // tail light
      put(at(-1, 0, 12 * VK), '255,40,30', ph < 0.45 ? 1 : 0.15, 4.5);                     // beacon over the cabin
      put(at(1, -r * 0.55, 3), '255,40,30', 0.75, 2.2); put(at(1, r * 0.55, 3), '60,255,90', 0.75, 2.2);
    } else if (u.def.type === 'bomber' || u.def.type === 'transport' || u.def.type === 'spyplane') {
      // Spots from each plane's own model (b1Model, tu22Model, c130Model, il76Model and the A-50; voxels, heights x VK).
      const al = u.faction === 'allies', P = PLANE_LIGHTS[u.def.type === 'bomber' ? (al ? 'b1' : 'tu22') : u.def.type === 'spyplane' ? (al ? 'sr71' : 'a50') : (al ? 'c130' : 'il76')];
      put(at(P.tip[0], -P.tip[1], P.tip[2] * VK), '255,40,30', 0.9, 2.6); put(at(P.tip[0], P.tip[1], P.tip[2] * VK), '60,255,90', 0.9, 2.6);
      put(at(P.tail[0], 0, P.tail[1] * VK), '255,255,255', ph < 0.06 || (ph > 0.16 && ph < 0.22) ? 1 : 0, 6);
      put(at(P.top[0], 0, P.top[1] * VK), '255,40,30', 0.5 + 0.5 * Math.sin((t + u.id) * 6.3), 3.5);
    } else {
      const span = r * (u.def.draw === 'cargo' ? 1.6 : 1.05);
      put(at(-r * 0.2, -span, 2), '255,40,30', 0.9, 2.6); put(at(-r * 0.2, span, 2), '60,255,90', 0.9, 2.6);   // port red, starboard green
      put(at(-r * 1.25, 0, 3), '255,255,255', ph < 0.06 || (ph > 0.16 && ph < 0.22) ? 1 : 0, 6);           // tail strobe: two quick flashes
      put(at(0, 0, 5), '255,40,30', 0.5 + 0.5 * Math.sin((t + u.id) * 6.3), 3.5);                          // beacon
    }
  }
  if (!pts.length) return;
  const vis2 = Math.min(1, night * 1.6);
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const [x, y, col, a, R] of pts) {
    const sx = (x - vx) * k, sy = (y - vy) * k, rr = R * k * 1.6, gr = g.createRadialGradient(sx, sy, 0, sx, sy, rr);
    gr.addColorStop(0, `rgba(${col},${(0.9 * a * vis2).toFixed(3)})`); gr.addColorStop(0.35, `rgba(${col},${(0.35 * a * vis2).toFixed(3)})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
  }
  g.globalCompositeOperation = 'source-over';
  for (const [x, y, col, a] of pts) { g.fillStyle = `rgba(${col},${Math.min(1, a * vis2).toFixed(3)})`; g.fillRect((x - vx) * k - k * 0.6, (y - vy) * k - k * 0.6, k * 1.2, k * 1.2); }
  g.restore();
}
function drawWeather(g, w, vx, vy, vw, vh, k, t, paused) {
  const F = weatherFx, now = performance.now(), dt = paused ? 0 : Math.min(0.05, (now - F.last) / 1000 || 0);
  F.last = now;
  if (F.kind !== w.kind) { F.kind = w.kind; F.parts = []; F.splash = []; }
  const L = weatherLevel(w, t), rain = w.kind === 'rain';
  const area = Math.min(3, (vw * vh) / (800 * 450));
  const want = Math.round((rain ? 520 : 300) * L * area);
  const P = F.parts, rnd = Math.random;
  const wrap = (v, a, n) => a + ((((v - a) % n) + n) % n);
  if (!rain) {
    while (P.length < want) P.push({ x: vx + rnd() * vw, y: vy + rnd() * vh, s: 0.6 + rnd() * 0.8, ph: rnd() * 7 });
    if (P.length > want) P.length = want;
    g.fillStyle = `rgba(214,222,236,${(0.04 + 0.08 * L).toFixed(3)})`;   // a pale veil in snow
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  }
  if (rain) {
    // Rain as drops falling through the air onto the ground (owner, 2026-11-23: "more realistic rather than a screen filter"):
    // each drop (not the near ones) falls toward a spot on the ground (X, Y, view px) from a height h above it, blown
    // downwind as it falls, and splashes there when it lands: a crown of droplets on land, rings on water. Three layers:
    // far (thin, faint, slower), middle, and a few near ones (long, soft, fast) that streak past the camera. Each streak
    // is its motion blur: a faint tail and a brighter head. Over it a light overcast, heavier toward the far (upper) side,
    // and sheets of heavier rain sweeping across with the wind.
    if (!w.storm || w.real) lightning(g, w.real || w, t, k, paused);   // (a storm's stand-in: the battle's own lightning only)
    const W = g.canvas.width, H = g.canvas.height;
    if (!F.haze || F.haze.h !== H) { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(18,26,38,1)'); gr.addColorStop(1, 'rgba(18,26,38,0.35)'); F.haze = { h: H, gr }; }
    g.save(); g.globalAlpha = 0.08 + 0.13 * L; g.fillStyle = F.haze.gr; g.fillRect(0, 0, W, H); g.restore();
    const wn = typeof windNow === 'function' ? windNow() : { x: -30, y: 0 }, slant = Math.max(-0.25, Math.min(0.25, wn.x / 220));
    if (!F.sheet) {   // soft streaky noise for the sheets of rain
      const N = 128, c = mkCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), r = rng(6151), a = Array.from({ length: 64 }, r);
      const vn = (u, v) => { const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, A = a[(i & 7) + (j & 7) * 8], B = a[((i + 1) & 7) + (j & 7) * 8], C = a[(i & 7) + ((j + 1) & 7) * 8], D = a[((i + 1) & 7) + ((j + 1) & 7) * 8];
        const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv); return A + (B - A) * su + (C - A) * sv + (A - B - C + D) * su * sv; };
      for (let y = 0; y < N; y++) for (let x2 = 0; x2 < N; x2++) { const n = vn(x2 / 16, y / 16), i = (y * N + x2) * 4; img.data[i] = 200; img.data[i + 1] = 212; img.data[i + 2] = 224; img.data[i + 3] = Math.round(255 * Math.max(0, (n - 0.45) / 0.55) ** 1.5); }
      x.putImageData(img, 0, 0); F.sheet = c;
    }
    const pat = g.createPattern(F.sheet, 'repeat');
    pat.setTransform(new DOMMatrix([7 * k, 0, slant * 9 * k, 9 * k, (-vx + t * slant * 260) * k, (-vy + t * 260) * k]));
    g.save(); g.globalAlpha = 0.05 + 0.1 * L; g.fillStyle = pat; g.fillRect(0, 0, W, H); g.restore();
    const LAY = [[0.55, 520, 1, 0.2, 0.42], [0.35, 700, 1.4, 0.26, 0.6], [0.1, 1050, 2.4, 0.16, 0.34]];   // share, speed (view px/s), width, tail and head alpha
    const spawn = (p, fresh) => {
      const r0 = rnd(); p.l = r0 < LAY[0][0] ? 0 : r0 < LAY[0][0] + LAY[1][0] ? 1 : 2;
      p.X = vx - 30 + rnd() * (vw + 60); p.Y = vy + rnd() * (vh + 160); p.h = (fresh ? rnd() : 1) * (140 + rnd() * 260);
      p.lift = 0;
      if (p.l < 2 && typeof gLift === 'function' && typeof G !== 'undefined' && G) { const [wx, wy] = fromView(p.X, p.Y); p.lift = gLift(wx, wy); }
    };
    while (P.length < want) { const p = {}; spawn(p, true); P.push(p); }
    if (P.length > want) P.length = want;
    const paths = LAY.map(() => [[], []]), wet = [];   // (line ends, stroked on g itself: the WebGL recorder sees moveTo / lineTo on g, not a Path2D's)
    for (const p of P) {
      if (p.X === undefined) spawn(p, true);
      const sp = LAY[p.l][1];
      p.h -= sp * dt;
      if (p.h <= 0) {
        if (p.l < 2 && wet.length < 400) wet.push(p.X, p.Y - p.lift);
        spawn(p, false);
      }
      if (p.X < vx - 60 || p.X > vx + vw + 60) p.X = wrap(p.X, vx - 30, vw + 60);
      if (p.Y < vy - 40 || p.Y > vy + vh + 200) p.Y = wrap(p.Y, vy, vh + 160);
      const len = sp * 0.024, hx = p.X + slant * p.h, hy = p.Y - p.lift - p.h;   // the drop's head on the screen (view px)
      const sx = (hx - vx) * k, sy = (hy - vy) * k, dx = slant * len * k, dy = len * k;
      paths[p.l][0].push(sx + dx, sy - dy, sx, sy);
      paths[p.l][1].push(sx + dx * 0.35, sy - dy * 0.35, sx, sy);
    }
    const line = (q) => { g.beginPath(); for (let j = 0; j < q.length; j += 4) { g.moveTo(q[j], q[j + 1]); g.lineTo(q[j + 2], q[j + 3]); } };
    LAY.forEach(([, , wd, ta, ha], i) => {
      g.lineWidth = Math.max(1, wd * k * 0.6);
      g.strokeStyle = `rgba(178,196,214,${(ta * (0.6 + 0.4 * L)).toFixed(3)})`; line(paths[i][0]); g.stroke();
      g.strokeStyle = `rgba(214,226,238,${(ha * (0.6 + 0.4 * L)).toFixed(3)})`; line(paths[i][1]); g.stroke();
    });
    // Splashes where drops landed: on water a ring spreading, on land a crown of droplets thrown up and a tiny ring.
    for (let i = 0; i < wet.length; i += 2) {
      let water = false;
      if (typeof G !== 'undefined' && G && G.terr) { const [wx, wy] = fromView(wet[i], wet[i + 1]), cx = Math.floor(wx / CELL), cy = Math.floor(wy / CELL); water = cx >= 0 && cy >= 0 && cx < MAP && cy < MAP && G.terr[cy * MAP + cx] >= 4; }
      if (F.splash.length < 700) F.splash.push({ x: wet[i], y: wet[i + 1], t: 0, water });
    }
    const q = Math.max(1, Math.round(k));
    g.beginPath(); g.fillStyle = 'rgba(205,218,232,0.6)';
    F.splash = F.splash.filter((s) => {
      s.t += dt;
      const life = s.water ? 0.5 : 0.22;
      if (s.t > life) return false;
      const u = s.t / life, sx = (s.x - vx) * k, sy = (s.y - vy) * k;
      if (!s.water) {
        const r = (1 + u * 3) * k, up = Math.sin(u * Math.PI) * 2.6 * k;
        g.fillRect(Math.round(sx - r), Math.round(sy - up), q, q); g.fillRect(Math.round(sx + r), Math.round(sy - up), q, q); g.fillRect(Math.round(sx), Math.round(sy - up * 1.4), q, q);
      }
      const R = (s.water ? 1 + u * 6 : 0.5 + u * 2.5) * k;
      g.moveTo(sx + R, sy); g.ellipse(sx, sy, R, R * 0.5, 0, 0, Math.PI * 2);   // (on g, not a Path2D: see the drops)
      return true;
    });
    g.strokeStyle = 'rgba(200,214,228,0.32)'; g.lineWidth = Math.max(1, k * 0.5); g.stroke();
  } else {
    for (const p of P) {
      p.y += (26 + 44 * p.s) * dt; p.ph += dt * (0.8 + p.s);
      p.x += Math.sin(p.ph) * 14 * dt - 8 * dt;
      p.x = wrap(p.x, vx - 10, vw + 20); p.y = wrap(p.y, vy - 10, vh + 20);
      // Big near flakes and small far ones, each with a faint shadow so they show against snow on the ground.
      const size = Math.max(1, Math.round((p.s > 1.15 ? 2.5 : p.s > 0.85 ? 1.6 : 1) * k)), sx = Math.round((p.x - vx) * k), sy = Math.round((p.y - vy) * k);
      g.fillStyle = 'rgba(52,62,84,0.32)'; g.fillRect(sx + Math.max(1, Math.round(k * 0.7)), sy + Math.max(1, Math.round(k * 0.7)), size, size);
      g.fillStyle = p.s > 1.15 ? 'rgba(252,253,255,0.95)' : 'rgba(240,245,252,0.8)';
      g.fillRect(sx, sy, size, size);
    }
  }
}

// ---------------------------------------------------------------------------
// The ground in tiles, and the marks of battle
// ---------------------------------------------------------------------------
// One picture of the whole ground would be WORLD x WORLD pixels (twice: the ground and the layer of wrecks and
// bodies above the ore), more than iPhones allow past 170 cells and a lot of memory below that. Instead the
// ground is painted in GROUND_TILE squares, only near the screen, and the least recently seen are let go when
// there are too many. Nothing is lost: everything ever drawn onto the ground (scorch marks, craters, rubble,
// base pads, wrecks, turrets and bodies) is kept in G.marks, in order, and drawn again onto a tile painted afresh.
//
// G.tctx and G.dctx are not canvases but the two layers (the ground, and the wrecks and bodies above the ore):
// the mark functions below, given one, record the mark and draw it on the tiles there are. Given a real canvas
// they just draw. The online host sends them to guests as before (netcore.js), where they are recorded the same way.
const GROUND_TILE = 256;
const MARK_FNS = ['scorch', 'crater', 'rubble', 'bakeWreck', 'bibDecal', 'padDecal', 'bakeTurret', 'bakeRagdoll'];
const MARK_DRAW = {};
// The box (world pixels, generous) each mark can draw in, from its arguments.
const MARK_BOX = {
  scorch: ([x, y, rad]) => [x, y, rad * 1.3 + 4],
  crater: ([x, y, rad, , dig]) => [x, y, dig ? 56 : rad * 1.8 + 4],   // (a dug crater's picture: up to 84 x 1.25 px across)
  bakeWreck: ([x, y]) => [x, y, 96],
  bakeTurret: ([fx]) => [fx.x, fx.y, 48],
  bakeRagdoll: ([fx]) => [fx.P[6], fx.P[7], 48],
};
const markBox = (n, a) => {
  if (n === 'bibDecal') { const m = typeof CON_M !== 'undefined' ? CON_M + 2 : 12; return [a[0] - m, a[1] - m, a[0] + a[2] + m, a[1] + a[3] + m]; }
  if (n === 'rubble') return [a[0] - 12, a[1] - 12, a[0] + a[2] + 12, a[1] + a[3] + 12];
  if (n === 'padDecal') return [a[0] - 2, a[1] - 2, a[0] + CELL + 2, a[1] + CELL + 2];
  const [x, y, r] = MARK_BOX[n](a);
  return [x - r, y - r, x + r, y + r];
};
// What a mark keeps of its arguments: copies of the effects it draws (they go on changing or are thrown away),
// and a wreck's char pattern.
function markArgs(n, a) {
  if (n === 'bakeWreck') { a = a.slice(); while (a.length < 6) a.push(undefined); if (a[6] === undefined) a[6] = (Math.random() * 1e6) | 0; return a; }
  if (n === 'bakeTurret') { const f = a[0]; return [{ x: f.x, y: f.y, rot: f.rot, def: f.def, tface: f.tface, seed: f.seed }]; }
  if (n === 'bakeRagdoll') {
    const f = a[0];
    return [{ v: f.v | 0, P: Array.from(f.P), pool: f.pool ? { seed: f.pool.seed, r: f.pool.r, a: f.pool.a } : null, burnt: !!f.burnt,
      faction: f.faction, unitType: f.unitType, gun: f.gun ? { P: Array.from(f.gun.P) } : null }];
  }
  return a;
}
function drawMark(g, m) {
  const keep = drawVar, spend = spriteSpend;
  spriteSpend = -1e9;   // marks are drawn for good: always with their own sprites, never a stand-in (models.js sprite)
  // (a turret keeps its charred picture on the effect it is given: give it a copy, so none is kept in G.marks)
  try { MARK_DRAW[m[1]](g, ...(m[1] === 'bakeTurret' ? [{ ...m[2][0] }] : m[2])); } finally { drawVar = keep; spriteSpend = spend; }
}
for (const n of MARK_FNS) {
  const f = MARK_DRAW[n] = globalThis[n];
  globalThis[n] = function (tg, ...a) {
    if (!tg || !tg.layer) return f(tg, ...a);
    if (typeof HEADLESS !== 'undefined' && HEADLESS) return;   // the game server draws nothing
    const args = markArgs(n, a), m = [tg.layer, n, args, ...markBox(n, args)];
    G.marks.push(m);
    if (G.ground) G.ground.add(G.marks.length - 1);
  };
}
// Ground workers: the pixels of a tile (groundPixels, about nine tenths of the cost of painting one) are worked out
// off the main thread, so scrolling or jumping across the map never stalls a frame; the main thread only puts them
// in a canvas and draws the scenery and marks on top. Made from the functions' own source (no extra file, so the
// single-file build and the offline cache are unchanged). null where there are no workers (the game server, a
// browser without them): makeGround then paints on the main thread a little at a time, as before.
let groundPool = null, groundGen = 0;
function groundWorkers() {
  if (groundPool !== null) return groundPool || null;
  groundPool = false;
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || (typeof HEADLESS !== 'undefined' && HEADLESS)) return null;
  try {
    const src = ["'use strict';",
      `const CELL = ${CELL}, CLIFF_H = ${CLIFF_H}, GRASS_TILE = ${JSON.stringify(GRASS_TILE)}, GRASS_TILE_N = ${GRASS_TILE_N};`,
      `const LOOK_SOFT = ${typeof LOOK_SOFT !== 'undefined' && !!LOOK_SOFT}, HD_FINE = ${HD_FINE};`,
      `const HILL_SHADE = ${typeof HILL_SHADE !== 'undefined' ? HILL_SHADE : 1};`,
      'let MAP = 0, WORLD = 0, NCELLS = 0;',
      ...[rng, groundPixels, cliffCells, paintCliffs, paintRuts, fordStone].map(String),
      `let px = null, gen = -1, pvBuf = null;
      onmessage = (e) => {
        const m = e.data;
        if (m.init) { gen = m.gen; MAP = m.MAP; WORLD = MAP * CELL; NCELLS = MAP * MAP; px = groundPixels(...m.args); return; }
        // (the buffer comes back from the main thread to be used again: no new 256 KB block for every tile)
        const K = m.pv ? 1 : m.K || 1, size = m.w * m.h * K * K * 4, d = m.buf && m.buf.byteLength === size ? new Uint8ClampedArray(m.buf) : pvBuf && pvBuf.byteLength === size && m.pv ? new Uint8ClampedArray(pvBuf) : new Uint8ClampedArray(size);
        if (m.pv) pvBuf = d.buffer;
        if (m.gen === gen) px.pixels(d, m.x, m.y, m.w, m.h, K);
        if (!m.pv) { postMessage({ gen: m.gen, k: m.k, w: m.w, h: m.h, d, ok: m.gen === gen }, [d.buffer]); return; }
        // A preview: the same pixels averaged down s times each way (the stand-in for a tile not painted yet).
        const s = m.pv, w2 = Math.ceil(m.w / s), h2 = Math.ceil(m.h / s), o = new Uint8ClampedArray(w2 * h2 * 4);
        for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
          let r = 0, g = 0, b = 0, c = 0;
          for (let j = y * s; j < Math.min(m.h, y * s + s); j++) for (let i = x * s; i < Math.min(m.w, x * s + s); i++) { const q = (j * m.w + i) * 4; r += d[q]; g += d[q + 1]; b += d[q + 2]; c++; }
          const q = (y * w2 + x) * 4; o[q] = r / c; o[q + 1] = g / c; o[q + 2] = b / c; o[q + 3] = 255;
        }
        postMessage({ pv: true, gen: m.gen, k: m.k, w: w2, h: h2, d: o, ok: m.gen === gen }, [o.buffer]);
      };`].join('\n');
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    const pool = { workers: [], onTile: null, failed: false };
    for (let i = 0; i < n; i++) {
      const w = new Worker(url);
      w.job = null;
      w.onmessage = (e) => { w.job = null; if (pool.onTile) pool.onTile(e.data); };
      w.onerror = (e) => { pool.failed = true; if (typeof Report !== 'undefined' && Report.oops) Report.oops('groundWorker', e.message || e); };
      pool.workers.push(w);
    }
    groundPool = pool;
  } catch (e) { groundPool = false; }
  return groundPool || null;
}
// The ground of the battle in G: newWorld and SaveGame.load make it (after setMapSize). legacy (old saves): the
// pictures the save kept, { g, d } bitmaps, in place of painting.
// A computer with memory to spare (not a phone or tablet: no touch screen, or Chrome reporting 8 GB) keeps every
// tile it paints and paints the rest of the map in the background once the preview is done, so scrolling back and
// forth never shows a tile being repainted. A phone keeps the tiles near the view only (memory).
const GROUND_ROOMY = typeof navigator !== 'undefined' && (navigator.deviceMemory >= 8 ||
  (navigator.deviceMemory === undefined && !(navigator.maxTouchPoints > 0) && !/iPhone|iPad|iPod|Android/.test(navigator.userAgent) && (navigator.hardwareConcurrency || 0) >= 4));
// A tile that comes in on screen fades in over its stand-in for this long (ms), rather than popping in.
const GROUND_FADE = 250;
function makeGround(painter, legacy, baked) {
  const T = GROUND_TILE, n = Math.ceil(WORLD / T), STRIP = 32;
  const tiles = new Map();            // tile number -> { g: canvas, d: canvas or null, used }, painted
  const pending = new Map();          // tile number -> { t, row }: being painted, STRIP rows at a time
  const index = Array.from({ length: n * n }, () => []);   // tile number -> the marks that reach it, in order
  let frameNo = 0, low = null, drawn = false;
  // Canvases of tiles let go are used again (cleared) rather than made afresh: on a phone, making and dropping
  // canvases while scrolling costs memory churn and pauses.
  const spare = [];
  let finished = 0;   // tiles finished so far
  // HD ground: a tile's canvas holds K pixels per world pixel (K = GK; baked sheets and old saves' pictures are at 1).
  const K = legacy || baked ? 1 : GK, TK = T * K;
  const tileCanvas = () => { const c = spare.pop(); if (!c) return mkCanvas(TK, TK); const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, TK, TK); return c; };
  const tileOf = (tx, ty) => ty * n + tx;
  // How many painted tiles are kept: a roomy computer all of them (HD ground: 400, about 400 MB at 512 px a tile), a phone
  // those round the view (HD ground: a quarter as many, each four times the memory).
  const keepN = (seen) => (GROUND_ROOMY ? (K > 1 ? 400 : n * n) : Math.max(Math.round(140 / (K * K)), seen * 3));
  const at = (k) => [(k % n) * T, Math.floor(k / n) * T];
  // With workers: the tiles wanted, in order (on screen nearest the middle first, then the ring round it), those
  // being worked out, and those whose pixels are back and wait to be finished on the main thread.
  const pool = legacy ? null : groundWorkers(), gen = ++groundGen;
  // The preview: the whole ground at a quarter size, worked out by the workers when they have nothing else to do
  // (and taken from every finished tile), shown blurred where a tile is not painted yet, instead of flat blocks.
  const PV = 4, pvDone = new Uint8Array(n * n), pvBusy = new Set();
  let pvCount = 0, released = false;   // tiles of the preview done; released: gl.js has the whole ground (stage 6)
  const pvMark = (k) => { if (!pvDone[k]) { pvDone[k] = 1; pvCount++; } };
  let shown = new Set();   // tiles on screen last frame as a stand-in: when they come in, they fade in
  // Baked ground (GroundSheets): the sheets decoded so far (a phone keeps the 12 last used), those loading; a tile is
  // cut from its sheet. If a file will not load, the ground is painted as before (bk.failed).
  const SH = GROUND_SHEET, per = Math.ceil(WORLD / SH);
  const bk = !legacy && baked ? { sheets: new Map(), loading: new Set(), keep: GROUND_ROOMY ? Infinity : 12, failed: false } : null;
  const fast = () => bk && !bk.failed;
  const fetchPic = (f) => fetch(baked.dir + f + (baked.q || '')).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.blob(); }).then((b) => createImageBitmap(b));
  if (bk) {
    fetchPic('preview.webp').then((bmp) => {
      if (bk.failed || released) return;
      const g = pvCtx(); g.drawImage(bmp, 0, 0);
      for (let k = 0; k < n * n; k++) pvMark(k);
    }).catch(() => {});
  }
  function sheetLoad(i) {
    bk.loading.add(i);
    fetchPic(i + '.webp').then((bmp) => {
      bk.loading.delete(i);
      bk.sheets.set(i, { bmp, used: frameNo });
      if (bk.sheets.size > bk.keep) {   // let the least recently used go (not one used this frame)
        const old = [...bk.sheets].filter(([, s]) => s.used < frameNo).sort((a, b) => a[1].used - b[1].used);
        for (let j = 0; j < old.length && bk.sheets.size > bk.keep; j++) bk.sheets.delete(old[j][0]);
      }
    }).catch((e) => { bk.loading.delete(i); bk.failed = true; if (typeof Report !== 'undefined' && Report.oops) Report.oops('groundSheet', e.message || e); });
  }
  // The wanted tiles whose sheet is in: ready to finish (cut out on the main thread, then the marks). Sheets that are
  // not in are asked for, four at a time, nearest first.
  function bakedFeed() {
    for (const k of queue) {
      if (tiles.has(k) || ready.has(k) || finishing.has(k)) continue;
      const [x0, y0] = at(k), i = Math.floor(y0 / SH) * per + Math.floor(x0 / SH), s = bk.sheets.get(i);
      if (s) { s.used = frameNo; ready.set(k, { bmp: s.bmp, sx: x0 % SH, sy: y0 % SH, w: Math.min(T, WORLD - x0), h: Math.min(T, WORLD - y0) }); }
      else if (!bk.loading.has(i) && bk.loading.size < 4) sheetLoad(i);
    }
  }
  let preview = null, pvCenter = 0;
  const pvCtx = () => { if (!preview) preview = mkCanvas(Math.ceil(WORLD / PV), Math.ceil(WORLD / PV)); return preview.getContext('2d'); };
  // The worst single steps of the last update (Report: stats.frames gp, gd, gm, gmk).
  const peak = { put: 0, dec: 0, mark: 0, mk: '' };
  let queue = [];
  const inflight = new Set(), ready = new Map(), bufs = [];   // bufs: pixel buffers back from tiles put in, sent out again
  // Tiles painted but for the marks of battle, drawn a few at a time (a tile on a busy battlefield can have
  // hundreds, too many for one frame): tile number -> { t, i: the next of index[k] to draw }. Shown once all are on.
  const finishing = new Map();
  function finishSome(k, until) {
    const f = finishing.get(k), list = index[k];
    if (!f.dr) { f.dr = 1; if (typeof lookDress === 'function') { const [x0, y0] = at(k), tg = f.t.g.getContext('2d'); tg.save(); tg.scale(K, K); if (K > 1 && typeof cliffShadowPaint === 'function') cliffShadowPaint(tg, x0, y0, T, T); if (!(f.baked && baked.patched)) lookPatchTile(tg, x0, y0); if (!(f.baked && baked.dressed)) lookDress(tg, x0, y0); tg.restore(); } }   // (look.js: the soft patches and ground dressing, once a tile; a baked sheet may have them in)
    while (f.i < list.length) {
      const a = performance.now(), m = G.marks[list[f.i++]];
      drawOn(f.t, k, m);
      const dt = performance.now() - a;
      if (dt > peak.mark) { peak.mark = dt; peak.mk = m[1]; }
      if (until && performance.now() >= until) break;
    }
    if (f.i < list.length) return false;
    finishing.delete(k);
    f.t.used = frameNo;
    f.t.ver = (f.t.ver || 0) + 1; tiles.set(k, f.t); finished++;   // (ver: gl.js uploads a tile again when it changes)
    if (!pvDone[k] && pool) { const [x0, y0] = at(k), g = pvCtx(); g.imageSmoothingEnabled = true; g.drawImage(f.t.g, 0, 0, Math.min(T, WORLD - x0) * K, Math.min(T, WORLD - y0) * K, x0 / PV, y0 / PV, Math.min(T, WORLD - x0) / PV, Math.min(T, WORLD - y0) / PV); pvMark(k); }
    return true;
  }
  if (pool) {
    for (const w of pool.workers) w.postMessage({ init: true, gen, MAP, args: painter.args });
    pool.onTile = (m) => {
      if (m.gen !== gen) return;
      if (m.pv) {
        pvBusy.delete(m.k);
        if (m.ok && !pvDone[m.k]) { const [x0, y0] = at(m.k); pvCtx().putImageData(new ImageData(m.d, m.w, m.h), x0 / PV, y0 / PV); pvMark(m.k); }
        feed(); return;
      }
      inflight.delete(m.k);
      if (m.ok && !tiles.has(m.k)) ready.set(m.k, m);
      feed();
    };
  }
  const useWorkers = () => pool && !pool.failed;
  // Gives each idle worker the next wanted tile.
  function feed() {
    if (fast()) { bakedFeed(); return; }
    if (!useWorkers()) return;
    for (const w of pool.workers) {
      if (w.job !== null) continue;
      let k;
      while (queue.length) { const c = queue.shift(); if (!tiles.has(c) && !ready.has(c) && !inflight.has(c) && !pending.has(c) && !finishing.has(c)) { k = c; break; } }
      if (k === undefined) {
        // Nothing on or round the screen to paint: the preview's tile nearest the view not done yet.
        let best = -1, bd = Infinity;
        const cx = pvCenter % n, cy = Math.floor(pvCenter / n);
        for (let c = 0; c < n * n; c++) {
          if (pvDone[c] || pvBusy.has(c)) continue;
          const d = Math.abs(c % n - cx) + Math.abs(Math.floor(c / n) - cy);
          if (d < bd) { bd = d; best = c; }
        }
        if (best < 0) return;
        const [x0, y0] = at(best);
        w.job = best; pvBusy.add(best);
        w.postMessage({ gen, k: best, x: x0, y: y0, w: Math.min(T, WORLD - x0), h: Math.min(T, WORLD - y0), pv: PV });
        continue;
      }
      const [x0, y0] = at(k), buf = bufs.pop();
      w.job = k; inflight.add(k);
      w.postMessage({ gen, k, x: x0, y: y0, w: Math.min(T, WORLD - x0), h: Math.min(T, WORLD - y0), K, buf }, buf ? [buf] : []);
    }
  }
  // A tile whose pixels came back from a worker: into a canvas, bridges and scenery on top, then the marks (finishSome).
  function finish(k, m) {
    const [x0, y0] = at(k), t = { g: tileCanvas(), d: null, used: frameNo }, g = t.g.getContext('2d');
    const a = performance.now();
    if (m.bmp) {   // baked: the tile cut from its sheet, bridges and scenery included
      g.drawImage(m.bmp, m.sx, m.sy, m.w, m.h, 0, 0, m.w, m.h);
      peak.put = Math.max(peak.put, performance.now() - a);
      finishing.set(k, { t, i: 0, baked: true });
      return;
    }
    g.putImageData(new ImageData(m.d, m.w * K, m.h * K), 0, 0);
    if (bufs.length < 8) bufs.push(m.d.buffer);
    const b = performance.now();
    painter.decorate(g, x0, y0, m.w, m.h, 0, 0, K);
    peak.put = Math.max(peak.put, b - a); peak.dec = Math.max(peak.dec, performance.now() - b);
    finishing.set(k, { t, i: 0 });
  }
  function add(i) {
    const m = G.marks[i];
    const tx0 = Math.max(0, Math.floor(m[3] / T)), ty0 = Math.max(0, Math.floor(m[4] / T));
    const tx1 = Math.min(n - 1, Math.floor(m[5] / T)), ty1 = Math.min(n - 1, Math.floor(m[6] / T));
    let drawn = false;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const k = tileOf(tx, ty);
      index[k].push(i);
      const t = tiles.get(k);
      if (t) { if (!drawn) { markPic(m); drawn = true; } copyOn(t, k, m); }   // (a tile still being painted gets it when finished)
    }
  }
  // A mark is drawn once into a scratch picture at its box, then copied onto each tile it reaches: drawn straight
  // onto tiles, its smoothed edges would come out a little differently on either side of a tile's edge.
  let scratch = null;
  // (HD ground: the scratch picture at the tiles' K pixels per world pixel; markCanvas, gl.js stage 6, is only used at 1)
  function markPic(m) {
    const bx = Math.floor(m[3]), by = Math.floor(m[4]), w = (Math.ceil(m[5]) - bx + 1) * K, h = (Math.ceil(m[6]) - by + 1) * K;
    if (!scratch || scratch.width < w || scratch.height < h) scratch = mkCanvas(Math.max(w, scratch ? scratch.width : 256), Math.max(h, scratch ? scratch.height : 256));
    const g = scratch.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    g.save(); g.scale(K, K); g.translate(-bx, -by); g._gk = K; drawMark(g, m); g._gk = 1; g.restore();
  }
  function copyOn(t, k, m) {
    if (m[0] === 'd' && !t.d) t.d = tileCanvas();
    const [x0, y0] = at(k), bx = Math.floor(m[3]), by = Math.floor(m[4]), w = (Math.ceil(m[5]) - bx + 1) * K, h = (Math.ceil(m[6]) - by + 1) * K;
    (m[0] === 't' ? t.g : t.d).getContext('2d').drawImage(scratch, 0, 0, w, h, (bx - x0) * K, (by - y0) * K, w, h);
    t.ver = (t.ver || 0) + 1;   // (gl.js: upload it again)
  }
  function drawOn(t, k, m) { markPic(m); copyOn(t, k, m); }
  // Paints some more of tile k (rows STRIP at a time until `until`, or all of it); true once it is done.
  function paintSome(k, until) {
    if (finishing.has(k)) return finishSome(k, until);
    const [x0, y0] = at(k), w = Math.min(T, WORLD - x0), h = Math.min(T, WORLD - y0);
    let p = pending.get(k);
    if (!p) pending.set(k, p = { t: { g: tileCanvas(), d: null, used: frameNo }, row: 0 });
    const g = p.t.g.getContext('2d');
    if (legacy) {
      g.drawImage(legacy.g, x0, y0, w, h, 0, 0, w, h);
      p.t.d = tileCanvas(); p.t.d.getContext('2d').drawImage(legacy.d, x0, y0, w, h, 0, 0, w, h);
      p.row = h;
    }
    while (p.row < h) {
      const rows = Math.min(STRIP, h - p.row);
      painter.paint(g, x0, y0 + p.row, w, rows, 0, p.row, K);
      p.row += rows;
      if (until && performance.now() >= until) break;
    }
    if (p.row < h) return false;
    pending.delete(k);
    finishing.set(k, { t: p.t, i: 0 });
    return finishSome(k, until);
  }
  // Keeps at most `keep` tiles: the least recently seen go first (never one seen this frame).
  function trim(keep) {
    if (tiles.size <= keep) return;
    const old = [...tiles].filter(([, t]) => t.used < frameNo - 1).sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < old.length && tiles.size > keep; i++) { const t = old[i][1]; spare.push(t.g); if (t.d) spare.push(t.d); tiles.delete(old[i][0]); }
    if (spare.length > 48) spare.length = 48;
  }
  // A stand-in for a tile not painted yet: the minimap's colours, one pixel a cell.
  function lowRes() {
    if (low && low.width === MAP) return low;
    low = mkCanvas(MAP, MAP);
    const g = low.getContext('2d'), cols = terrainMini();
    for (let i = 0; i < NCELLS; i++) { g.fillStyle = cols[G.terr[i]]; g.fillRect(i % MAP, Math.floor(i / MAP), 1, 1); }
    return low;
  }
  // The tiles over world rect (sx, sy, sw, sh), nearest its middle first.
  // keepTile (the iso view, ui.js): of the tiles in the box, only those that show on the screen (pad: how far round it).
  let keepTile = null;
  const tilesIn = (sx, sy, sw, sh, pad) => {
    const out = [], mx = sx + sw / 2, my = sy + sh / 2;
    for (let ty = Math.max(0, Math.floor(sy / T)); ty <= Math.min(n - 1, Math.floor((sy + sh - 1) / T)); ty++)
      for (let tx = Math.max(0, Math.floor(sx / T)); tx <= Math.min(n - 1, Math.floor((sx + sw - 1) / T)); tx++) if (!keepTile || keepTile(tx * T, ty * T, T, pad || 0)) out.push(tileOf(tx, ty));
    const dist = (k) => { const [x, y] = at(k); return Math.hypot(x + T / 2 - mx, y + T / 2 - my); };
    return out.sort((a, b) => dist(a) - dist(b));
  };
  return {
    add, tiles, missing: 0,
    get bakedOk() { return fast(); },   // (the baked sheets still load: look.js leaves the crags' shadows to them)
    // Before drawing a frame of view rect (sx, sy, sw, sh): paints what is missing on screen for up to `ms`
    // milliseconds, then (`ahead` ms) the tiles in a ring round it, so scrolling finds them ready. The first frame
    // paints all it shows, however long that takes (without workers only).
    // With workers, `ms` is the time for finishing tiles whose pixels are back, on screen first, and the workers are
    // given the tiles on screen, then the ring.
    keep(fn) { keepTile = fn; },
    // gl.js stage 6 (the whole ground on the GPU, compressed): where the baked sheets are, a mark drawn on its own (the
    // scratch picture, its box at m[3..6]), and release(): the tiles, sheets and preview let go, nothing painted until
    // `resident` is cleared again (WebGL failed: the tiles come back as before).
    src: baked && !legacy ? { dir: baked.dir, q: baked.q || '', per, SH, dressed: !!baked.dressed } : null,
    markCanvas(m) { markPic(m); return scratch; },
    resident: false,
    release() {
      this.resident = true; released = true; this.missing = 0; this.blocky = 0;
      tiles.clear(); pending.clear(); finishing.clear(); ready.clear(); queue = []; spare.length = 0; shown = new Set();
      if (bk) bk.sheets.clear();
      preview = null; low = null; pvDone.fill(0); pvCount = 0;
    },
    update(sx, sy, sw, sh, ms, ahead) {
      if (this.resident) { this.missing = 0; return; }
      released = false;
      frameNo++;
      peak.put = peak.dec = peak.mark = 0; peak.mk = '';
      pvCenter = tileOf(Math.max(0, Math.min(n - 1, Math.floor((sx + sw / 2) / T))), Math.max(0, Math.min(n - 1, Math.floor((sy + sh / 2) / T))));
      const tIn = performance.now(), had = finished;
      try { this.upd(sx, sy, sw, sh, ms, ahead); } finally { this.ms = performance.now() - tIn; this.made = finished - had; }
    },
    ms: 0, made: 0, peak, blocky: 0,   // the last update's time, tiles finished and worst steps (Report: stats.frames)
    upd(sx, sy, sw, sh, ms, ahead) {
      const t0 = performance.now(), seen = tilesIn(sx, sy, sw, sh);
      // The first frame too: it waits behind the deploying card (ui.js) while the workers paint, rather than painting
      // everything on screen here (over a second on a phone, the game frozen at the start of every battle and of the menu).
      // (A first frame given all the time it wants, as tests do, still paints it all here.)
      if (fast() || (useWorkers() && (drawn || ms < 1e6))) {   // (baked: the first frame waits for its sheets too, behind the deploying card)
        const want = seen.filter((k) => !tiles.has(k));
        for (const k of tilesIn(sx - T, sy - T, sw + 2 * T, sh + 2 * T, T)) if (!tiles.has(k) && !want.includes(k)) want.push(k);
        const near = want.length;
        // A roomy computer, once the preview is done: the rest of the map, nearest the view first, a few at a time
        // (finished with the `ahead` time only, after what is on and round the screen).
        if (GROUND_ROOMY && pvCount === n * n && tiles.size + finishing.size < Math.min(n * n, keepN(0))) {
          const cx = pvCenter % n, cy = Math.floor(pvCenter / n), more = [], has = new Set(want);
          for (let c = 0; c < n * n; c++) if (!tiles.has(c) && !has.has(c)) more.push([Math.abs(c % n - cx) + Math.abs(Math.floor(c / n) - cy), c]);
          more.sort((a, b) => a[0] - b[0]);
          for (let i = 0; i < Math.min(more.length, (pool ? pool.workers.length : 2) + 4); i++) want.push(more[i][1]);
        }
        for (let i = 0; i < want.length; i++) {
          const k = want[i];
          if (performance.now() >= t0 + (i < near ? ms : Math.min(ms, ahead))) break;
          if (!finishing.has(k)) { const m = ready.get(k); if (!m) continue; ready.delete(k); finish(k, m); }
          finishSome(k, t0 + ms);
        }
        if (ready.size > 16) for (const k of [...ready.keys()]) if (!want.includes(k)) ready.delete(k);   // scrolled away before finished
        queue = want;
        feed();
      } else {
        for (const k of seen) if (!tiles.has(k) && !paintSome(k, drawn ? t0 + ms : 0) && drawn) break;
      }
      drawn = true;
      if (!fast() && !useWorkers() && performance.now() < t0 + ms) {
        const ring = tilesIn(sx - T, sy - T, sw + 2 * T, sh + 2 * T, T).filter((k) => !tiles.has(k));
        const until = performance.now() + ahead;
        for (const k of ring) if (!paintSome(k, until) || performance.now() >= until) break;
      }
      let missing = 0, blocky = 0;
      const now = performance.now(), wasShown = shown;
      shown = new Set();
      for (const k of seen) {
        const t = tiles.get(k);
        if (t) { t.used = frameNo; if (wasShown.has(k)) t.born = now; }   // was a stand-in on screen last frame: fade in
        else { missing++; shown.add(k); if (!pvDone[k]) blocky++; }
      }
      this.missing = missing;   // tiles on screen still showing a stand-in (tests)
      this.blocky = blocky;     // of those, with no preview yet: the flat minimap colours
      trim(keepN(seen.length));
    },
    // For the WebGL renderer (gl.js): the tile size, tiles across, a tile's corner, the tiles of a box, a painted tile
    // ({ g, d, ver }) or none, and the stand-in for unpainted ground (a pixel a cell).
    K,   // (HD ground: the tiles' pixels per world pixel)
    gl: { T, K, n, at, tilesIn: (sx, sy, sw, sh) => tilesIn(sx, sy, sw, sh), tile: (k) => tiles.get(k), low: () => lowRes(),
      // the preview (quarter size, PV) as the stand-in where it is done, and how many of its tiles are (it changes)
      PV, preview: () => preview, pvN: () => pvCount, pvHas: (k) => pvDone[k] === 1, fade: GROUND_FADE },
    // Draws one layer ('t' the ground, 'd' the wrecks and bodies) of world rect (sx, sy, sw, sh) into g at (dx, dy).
    // The raised ground (look.js hillWarp): the chunks (HILL_CH px squares of the world grid, inside one tile) of world
    // rect (sx, sy, sw, sh), and one layer of one chunk drawn in g (its transform already set: hillWarp set).
    chunks(sx, sy, sw, sh) {
      const N = HILL_CH, out = [], S = VIEW.s, C = VIEW.c;
      if (sw <= 0 || sh <= 0) return out;
      for (const k of tilesIn(sx, sy, sw, sh)) {
        const [x0, y0] = at(k), xe = Math.min(x0 + T, WORLD), ye = Math.min(y0 + T, WORLD);
        const a0 = Math.max(x0, Math.floor(sx / N) * N), b0 = Math.max(y0, Math.floor(sy / N) * N), a1 = Math.min(xe, sx + sw), b1 = Math.min(ye, sy + sh);
        if (a1 <= a0 || b1 <= b0) continue;
        if (hillTileFlat(k, x0, y0, xe, ye)) { out.push({ k, X0: Math.max(x0, sx), Y0: Math.max(y0, sy), X1: a1, Y1: b1, key: x0 * S + y0 * C, fit: HILL_FLAT_FIT }); continue; }   // flat: one piece
        for (let Y = b0; Y < b1; Y += N) for (let X = a0; X < a1; X += N) out.push({ k, X0: X, Y0: Y, X1: Math.min(X + N, xe), Y1: Math.min(Y + N, ye), key: X * S + Y * C });
      }
      return out;
    },
    drawChunk(g, c, layer) {
      const t = tiles.get(c.k), [x0, y0] = at(c.k), L = HILL_LAP, { X0, Y0, X1, Y1 } = c, w = X1 - X0, h = Y1 - Y0;
      if (t) {
        t.born = 0;
        const img = layer === 't' ? t.g : t.d;
        if (img) g.drawImage(img, (X0 - x0) * K, (Y0 - y0) * K, w * K, h * K, X0 - L, Y0 - L, w + 2 * L, h + 2 * L);
      } else if (layer === 't') {
        if (pvDone[c.k] && preview) { g.imageSmoothingEnabled = true; g.drawImage(preview, X0 / PV, Y0 / PV, w / PV, h / PV, X0 - L, Y0 - L, w + 2 * L, h + 2 * L); g.imageSmoothingEnabled = false; }
        else g.drawImage(lowRes(), X0 / CELL, Y0 / CELL, w / CELL, h / CELL, X0 - L, Y0 - L, w + 2 * L, h + 2 * L);
      }
    },
    draw(g, layer, sx, sy, sw, sh, dx, dy) {
      if (sw <= 0 || sh <= 0) return;
      for (const k of tilesIn(sx, sy, sw, sh)) {
        const t = tiles.get(k), [x0, y0] = at(k);
        const ix = Math.max(sx, x0), iy = Math.max(sy, y0), iw = Math.min(sx + sw, x0 + T, WORLD) - ix, ih = Math.min(sy + sh, y0 + T, WORLD) - iy;
        if (iw <= 0 || ih <= 0) continue;
        const standIn = () => {
          if (pvDone[k] && preview) {   // the preview, blurred up
            const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = true;
            g.drawImage(preview, ix / PV, iy / PV, iw / PV, ih / PV, dx + ix - sx, dy + iy - sy, iw, ih);
            g.imageSmoothingEnabled = sm;
          } else g.drawImage(lowRes(), ix / CELL, iy / CELL, iw / CELL, ih / CELL, dx + ix - sx, dy + iy - sy, iw, ih);
        };
        if (!t) { if (layer === 't') standIn(); continue; }
        const c = layer === 't' ? t.g : t.d;
        if (!c) continue;
        const age = t.born ? (performance.now() - t.born) / GROUND_FADE : 1;
        if (age < 1) {   // coming in: over its stand-in, more of it each frame
          if (layer === 't') standIn();
          const a = g.globalAlpha; g.globalAlpha = a * Math.max(0, age);
          g.drawImage(c, (ix - x0) * K, (iy - y0) * K, iw * K, ih * K, dx + ix - sx, dy + iy - sy, iw, ih);
          g.globalAlpha = a;
        } else { t.born = 0; g.drawImage(c, (ix - x0) * K, (iy - y0) * K, iw * K, ih * K, dx + ix - sx, dy + iy - sy, iw, ih); }
      }
    },
    // The whole of one layer in one picture (tests only: too big for a phone on large maps).
    whole(layer) {
      const c = mkCanvas(WORLD, WORLD), g = c.getContext('2d');
      for (let k = 0; k < n * n; k++) {
        if (!tiles.has(k)) paintSome(k, 0);
        const t = tiles.get(k), cv = layer === 't' ? t.g : t.d, [x0, y0] = at(k);
        if (cv) g.drawImage(cv, x0, y0, cv.width / K, cv.height / K);
      }
      return c;
    },
    forget() { tiles.clear(); pending.clear(); ready.clear(); finishing.clear(); },
    // The map editor (editorCarry): a finished tile of the last build whose ground is unchanged, taken as it is.
    adopt(k, t) {
      if (tiles.has(k) || pending.has(k) || finishing.has(k)) return;
      ready.delete(k); t.used = frameNo; t.ver = (t.ver || 0) + 1; tiles.set(k, t); finished++;
      if (!pvDone[k]) { const [x0, y0] = at(k), g = pvCtx(); g.imageSmoothingEnabled = true; g.drawImage(t.g, 0, 0, Math.min(T, WORLD - x0) * K, Math.min(T, WORLD - y0) * K, x0 / PV, y0 / PV, Math.min(T, WORLD - x0) / PV, Math.min(T, WORLD - y0) / PV); pvMark(k); }
    },
    previewDone: () => pvDone.reduce((a, v) => a + v, 0) / (n * n),   // (tests)
  };
}
// The two layers marks are drawn on (G.tctx, G.dctx), and a new battle's ground.
const GROUND_LAYER = { layer: 't' }, DECAL_LAYER = { layer: 'd' };
function newGround(g, legacy) {
  SpriteSheets.need(['burnt'].concat(g.teams.map((t) => t.faction + (t.variant | 0))));   // this battle's colours, baked (models.js)
  g.marks = g.marks || [];
  g.tctx = GROUND_LAYER; g.dctx = DECAL_LAYER;
  const id = validMap(g.mapId), man = GroundSheets.manifest, bm = GroundSheets.ok() && man && man.maps && man.maps[id];
  const baked = GK === 1 && bm && bm.key === groundKey(g) ? { dir: 'grounds/' + id + '/', q: '?k=' + bm.key + (man.code ? '.' + man.code : ''), patched: !!man.patched, dressed: !!bm.dressed } : null;
  const painter = groundPainter(g.terr, groundSeed(g), g.road, g.bridges, g.cliff, g.ford, mapTheme(g.mapId), MAPS[id].bridge, g.hgt, mesaTops(g.mapId));
  g.ground = makeGround(painter, legacy, baked);
  g.ground.baked = !!baked; g.ground.painter = painter;
  // The trees, drawn live over the ground (treesInView, drawTree); an old save's ground pictures have them painted in.
  g.ground.trees = legacy || (typeof HEADLESS !== 'undefined' && HEADLESS) ? [] : painter.trees();
  const G0 = G; G = g;   // (add reads G.marks)
  try { for (let i = 0; i < g.marks.length; i++) g.ground.add(i); } finally { G = G0; }
}

// The map editor's real view is rebuilt after every change (ui.js EditorHooks.live). Rebuilt from nothing, a big map's
// whole ground and every crag were painted again (Lakeside: about a minute of blurred ground and crags rising in, owner
// 2026-11-25). Here the new battle g takes from the last one (old) every ground tile and crag whose inputs are the same:
// the cells within EDIT_KEEP_M cells (terrain, cliffs, shallows, ore, blocked, hills, houses, roads) and, for a tile,
// the scenery stamps over it. Only what is near the change is painted again.
const EDIT_KEEP_M = 6;
function editorCarry(old, g) {
  if (!old || !g || old === g || !old.ground || !g.ground || old.terr.length !== g.terr.length) return null;
  if (old.ground.resident || g.ground.resident || old.ground.baked || g.ground.baked) return null;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // (the editor replaces MAPS[id] before each build: what the old one was built from is kept as G.editMap)
  if (old.mapId !== g.mapId || !old.editMap || !g.editMap || !same(old.editMap, g.editMap) || groundSeed(old) !== groundSeed(g)) return null;
  const ch = new Uint8Array(NCELLS), mark = (cx, cy) => { if (cx >= 0 && cy >= 0 && cx < MAP && cy < MAP) ch[cy * MAP + cx] = 1; };
  const arr = (a, b) => { if (!a || !b) { if (a !== b) ch.fill(1); return; } for (let i = 0; i < NCELLS; i++) if (a[i] !== b[i]) ch[i] = 1; };
  arr(old.terr, g.terr); arr(old.cliff, g.cliff); arr(old.ford, g.ford); arr(old.ore, g.ore); arr(old.gem, g.gem); arr(old.block, g.block); arr(old.hgt, g.hgt);
  // Houses and roads: those not in both, their cells.
  const hk = (h) => [h.cx, h.cy, h.w, h.h, h.type].join(), hb = new Set(g.houses.map(hk)), ha = new Set(old.houses.map(hk));
  for (const [list, other] of [[old.houses, hb], [g.houses, ha]]) for (const h of list) if (!other.has(hk(h))) for (let y = h.cy; y < h.cy + h.h; y++) for (let x = h.cx; x < h.cx + h.w; x++) mark(x, y);
  const rk = (l) => JSON.stringify(l), rb = new Set((g.road || []).map(rk)), ra = new Set((old.road || []).map(rk));
  for (const [list, other] of [[old.road || [], rb], [g.road || [], ra]]) for (const l of list) if (!other.has(rk(l))) for (const p of l) { const x = Array.isArray(p) ? p[0] : p.x, y = Array.isArray(p) ? p[1] : p.y; mark(Math.floor(x / CELL), Math.floor(y / CELL)); }
  // Bridges (each drawn over its own box): those not in both, the cells of their box.
  const bk = (b) => JSON.stringify([b.a.x, b.a.y, b.b.x, b.b.y, b.w]), bb = new Set((g.bridges || []).map(bk)), ba = new Set((old.bridges || []).map(bk));
  for (const [list, other] of [[old.bridges || [], bb], [g.bridges || [], ba]]) for (const b of list) if (!other.has(bk(b))) {
    const e = b.w / 2 + 12;
    for (let y = Math.floor((Math.min(b.a.y, b.b.y) - e) / CELL); y <= Math.floor((Math.max(b.a.y, b.b.y) + e) / CELL); y++)
      for (let x = Math.floor((Math.min(b.a.x, b.b.x) - e) / CELL); x <= Math.floor((Math.max(b.a.x, b.b.x) + e) / CELL); x++) mark(x, y);
  }
  // Grown by M cells (a summed table: is anything changed in a box).
  const M = EDIT_KEEP_M, W = MAP + 1, sum = new Int32Array(W * W);
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) sum[(y + 1) * W + x + 1] = ch[y * MAP + x] + sum[y * W + x + 1] + sum[(y + 1) * W + x] - sum[y * W + x];
  const any = (x0, y0, x1, y1) => { x0 = Math.max(0, x0 - M); y0 = Math.max(0, y0 - M); x1 = Math.min(MAP - 1, x1 + M); y1 = Math.min(MAP - 1, y1 + M); return sum[(y1 + 1) * W + x1 + 1] - sum[y0 * W + x1 + 1] - sum[(y1 + 1) * W + x0] + sum[y0 * W + x0] > 0; };
  let tiles = 0, crags = 0;
  // Ground tiles (finished ones: no marks of battle in the editor).
  const go = old.ground, gn = g.ground, T = GROUND_TILE, n = Math.ceil(WORLD / T);
  if (go.painter && gn.painter && go.tiles && gn.adopt) {
    const sa = go.painter.stamps(), sb = gn.painter.stamps();
    const over = (list, X0, Y0) => list.filter((s) => s.x1 > X0 && s.x0 < X0 + T && s.y1 > Y0 && s.y0 < Y0 + T);
    for (const [k, t] of go.tiles) {
      const X0 = (k % n) * T, Y0 = Math.floor(k / n) * T;
      if (any(Math.floor(X0 / CELL), Math.floor(Y0 / CELL), Math.floor((X0 + T - 1) / CELL), Math.floor((Y0 + T - 1) / CELL))) continue;
      const a = over(sa, X0, Y0), b = over(sb, X0, Y0);
      if (a.length !== b.length || a.some((s, i) => s.s !== b[i].s || s.x !== b[i].x || s.y !== b[i].y || !!s.bush !== !!b[i].bush)) continue;
      gn.adopt(k, t); tiles++;
    }
  }
  // Crags (look.js): the pictures of cliff cells with nothing changed near.
  if (typeof cliffLook !== 'undefined' && cliffLook && cliffLook.g === old && typeof cliffLookFor === 'function') {
    const La = cliffLook, G0 = G; G = g;
    try {
      const Lb = cliffLookFor();
      for (const [c, p] of La.pics) {
        if (!Lb.cells.has(c) || (p && p.baked)) continue;
        const x = c % MAP, y = (c / MAP) | 0;
        if (any(x, y, x, y)) continue;
        if (p) p.born = 0;
        Lb.pics.set(c, p); crags++;
      }
    } finally { G = G0; }
  }
  return { tiles, crags };
}

// ---------------------------------------------------------------------------
// Units & structures
// ---------------------------------------------------------------------------
function flash(g, x, y, s) {
  g.fillStyle = 'rgba(255,200,80,0.55)';
  g.beginPath(); g.arc(x, y, s + 1.5, 0, 7); g.fill();
  g.fillStyle = '#fff8d8'; g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  g.fillStyle = 'rgba(255,220,120,0.9)'; g.fillRect(Math.round(x - s - 1), Math.round(y), s * 2 + 2, 1); g.fillRect(Math.round(x), Math.round(y - s - 1), 1, s * 2 + 2);
}

// Soldiers standing about fidget: they look around, rest or shoulder their weapons, check
// their sights, stretch, juggle a grenade and, after a long quiet spell, drop for push-ups.
// Purely for show, timed from game time and each soldier's id.
const IDLES = {
  rifle: ['look', 'rest', 'aim', 'stretch', 'look', 'pushups', 'none'],
  rocket: ['look', 'rest', 'stretch', 'look', 'pushups', 'none'],
  grenadier: ['look', 'juggle', 'rest', 'stretch', 'pushups', 'none'],
  pilot: ['look', 'rest', 'stretch', 'none'],
  technician: ['look', 'rest', 'stretch', 'look', 'none'],
  sniper: ['look', 'aim', 'aim', 'rest', 'none'],
  flamer: ['look', 'stretch', 'look', 'none'],
  spec: ['look', 'aim', 'stretch', 'rest', 'none'],
};
function idlePose(u, t) {
  if (u.moving || u.stance || u.target || u.fireT > 0 || u.chute > 0 || u.alt > 0) { u.idleFrom = t; return null; }
  if (u.idleFrom === undefined) u.idleFrom = t;
  const still = t - u.idleFrom;
  if (still < 3) return null;
  const CY = 8, off = hash3(u.id, 3, 7) * CY, tt = still + off, cyc = Math.floor(tt / CY), ct = tt % CY;
  const list = IDLES[u.type] || IDLES.rifle;
  let kind = list[Math.floor(hash3(u.id, cyc, 11) * list.length)];
  if (kind === 'pushups' && still < 15) kind = 'look';
  const dur = kind === 'pushups' ? 5.5 : kind === 'stretch' ? 2 : 2.5 + hash3(u.id, cyc, 5) * 2.5;
  if (ct > dur || kind === 'none') return null;
  switch (kind) {
    case 'look': return { frame: 0, turn: Math.sin(ct * 1.7) * 0.8 };
    case 'rest': return { frame: 6 };
    case 'aim': return { frame: ct < 0.4 || ct > dur - 0.4 ? 6 : 7 };
    case 'stretch': return { frame: 10 };
    case 'juggle': return { frame: Math.floor(ct / 0.4) % 2 ? 3 : 0 };
    case 'pushups': return { frame: ct < 0.5 || ct > dur - 0.4 ? 5 : Math.floor((ct - 0.5) / 0.45) % 2 ? 9 : 8 };
  }
  return null;
}
// Unit sprites are made the first time they are drawn (models.js sprite), which stalls a frame when a big fight
// comes into view. warmSprites (ui.js, a couple of ms a frame) makes them ahead: for the kind of unit on the map
// nearest the view not done yet, every facing of its hull and turret (both looks of a V2 and an Ore Truck), and a
// soldier's common poses (standing, walking, firing, crouching, prone).
const WARM_POSES = [0, 1, 12, 2, 13, 7, 4, 5, 14, 15];
const warmDone = new Set();
let warmJobs = [], warmIdleT = 0;
function warmSprites(budgetMs, cx, cy) {
  if (!G || (typeof HEADLESS !== 'undefined' && HEADLESS)) return;
  const t0 = performance.now();
  while (performance.now() - t0 < budgetMs) {
    if (!warmJobs.length) {
      if (t0 < warmIdleT) return;
      let best = null, bd = Infinity;
      for (const e of G.entities) {
        if (!e.alive || e.kind !== 'unit' || warmDone.has(e.type + e.faction + (G.teams[e.team].variant | 0))) continue;
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) { warmIdleT = t0 + 1000; return; }   // all done: look again in a second
      const v = G.teams[best.team].variant | 0, def = best.def, f = best.faction;
      warmDone.add(best.type + f + v);
      if (best.cls === 'inf') {
        for (const pose of WARM_POSES) {
          if (pose === 7 && (best.type === 'rocket' || best.type === 'grenadier' || best.type === 'pilot' || best.type === 'technician' || best.type === 'engineer' || best.type === 'flamer')) continue;
          for (let i = 0; i < 16; i++) warmJobs.push({ v, run: () => infSprite({ type: best.type, faction: f, face: i * Math.PI / 8 }, palFor(f), pose) });
        }
      } else {
        const looks = def.draw === 'v2' ? [0, 1, 2, 3].flatMap((k) => [{ cd: 0, setup: k / 3 }, { cd: 2, setup: k / 3 }]) : def.draw === 'harv' ? [{ load: 0 }, { load: def.capacity }]
          : def.type === 'comanche' ? [0, 1, 2].map((k) => ({ bay: k / 2 })) : [{}];
        const wreck = !warmDone.has('burnt' + best.type) && def.cls !== 'air';   // its wreck too (bakeWreck), once per type
        if (wreck) warmDone.add('burnt' + best.type);
        for (let i = 0; i < FACINGS; i++) {
          const a = i * Math.PI * 2 / FACINGS;
          for (const l of looks) warmJobs.push({ v, run: () => hullSprite({ def, faction: f, face: a, ...l }, palFor(f)) });
          warmJobs.push({ v, run: () => turretSprite({ def, faction: f, tface: a }, palFor(f)) });
          if (wreck) warmJobs.push({ v, run: () => { hullSprite({ def, face: a, tface: a, load: 0 }, BURNT); turretSprite({ def, tface: a }, BURNT); } });
        }
      }
    }
    const j = warmJobs.shift(), keep = drawVar, spend = spriteSpend;
    drawVar = j.v; spriteSpend = -1e9;
    try { j.run(); } finally { drawVar = keep; spriteSpend = spend; }
  }
}
const INF_ANIM = new WeakMap(), WALK = [1, 12, 2, 13];   // per soldier: when they last changed stance and last fired (drawing only)
// A vehicle just out of the War Factory (world.js updateDoors) is drawn rolling from the doorway to where it stands,
// coming out of the dark over EMERGE.
function drawUnit(g, u, t) {
  const ek = u.outT == null ? 1 : (G.t - u.outT) / EMERGE;
  if (!(ek >= 0 && ek < 1)) return drawUnitBody(g, u, t);
  const x = u.x, y = u.y, e = ek * (2 - ek), a = g.globalAlpha;
  u.x = u.outX + (x - u.outX) * e; u.y = u.outY + (y - u.outY) * e;
  g.globalAlpha = a * Math.min(1, 0.25 + ek * 1.5);
  try { drawUnitBody(g, u, t); } finally { u.x = x; u.y = y; g.globalAlpha = a; }
}
function drawUnitBody(g, u, t) {
  drawVar = G.teams[u.team].variant | 0;
  const pal = palFor(u.faction);
  if (u.cls === 'inf') {
    if (u.chute > 0) { drawChute(g, u, pal, t); return; }
    if (u.def.setup) {   // the MG Team: carrying the gun, setting it up (or packing it), or set up on its mount
      const st = u.setup || 0, frame = st >= 1 ? 5 : st > 0 ? 4 : u.moving ? WALK[Math.floor(u.anim / 2.5) % 4] : 0;
      const rk = u.fireT > 0 && st >= 1 ? 0.6 : 0;
      blit(g, infSprite(u, pal, frame), u.x - Math.cos(u.face) * rk, u.y - Math.sin(u.face) * rk - (frame === 12 || frame === 13 ? 1 : 0));
      if (u.fireT > 0 && st >= 1) { const r = (u.faction === 'soviets' ? 21 : 19) * INF_SCALE; flash(g, ...liftPt(u.x + Math.cos(u.face) * r, u.y + Math.sin(u.face) * r, 8 * INF_SCALE), 1); }
      return;
    }
    // As in Red Alert: a four-pose walk, the weapon brought up to the shoulder to shoot (and held
    // there a moment), dropping prone under fire through a crouch, crawling, and getting up again.
    const prone = u.stance === 'prone', gun = u.type !== 'rocket' && u.type !== 'grenadier' && u.type !== 'pilot' && u.type !== 'technician' && u.type !== 'engineer' && u.type !== 'flamer';
    let a = INF_ANIM.get(u);
    if (!a) INF_ANIM.set(u, a = { prone, at: -9, aim: -9 });
    if (a.prone !== prone) { a.prone = prone; a.at = t; }
    if (u.fireT > 0) a.aim = t;
    const change = t - a.at < 0.16 && t >= a.at;
    let frame = change ? 4 : prone ? (u.moving ? 14 + (Math.floor(u.anim / 3) % 2) : 5)
      : u.type === 'grenadier' && u.fireT > 0.12 ? 3
      : u.moving ? WALK[Math.floor(u.anim / 2.5) % 4]
      : gun && t - a.aim < 0.7 && t >= a.aim ? 7 : 0;
    const stance = change ? 'crouch' : prone && 'prone';
    const idle = idlePose(u, t);
    if (idle) { frame = idle.frame; if (idle.turn) u = { type: u.type, faction: u.faction, face: u.face + idle.turn, x: u.x, y: u.y }; }
    if (u.aaUntil > G.t && frame === 0 && u.type === 'rocket') frame = 11;   // firing the RedEye at an aircraft
    // The kick of the shot, and the bob of the walk as one foot passes the other.
    const rk = u.fireT > 0 && (frame === 7 || frame === 5 || (frame === 0 && u.type === 'rocket')) ? Math.min(1, u.fireT / 0.1) * 1.5 * INF_SCALE : 0;
    blit(g, infSprite(u, pal, frame), u.x - Math.cos(u.face) * rk, u.y - Math.sin(u.face) * rk - (frame === 12 || frame === 13 ? 1 : 0));
    const mh = (frame === 11 ? 20 : frame === 7 ? 13 : stance === 'prone' ? 2 : stance === 'crouch' ? 6 : 11) * INF_SCALE, mr = (frame === 7 && u.type === 'sniper' ? 18 : frame === 11 || frame === 7 ? 13 : stance === 'prone' ? 12 : 10) * INF_SCALE;
    if (u.fireT > 0 && u.type !== 'flamer') flash(g, ...liftPt(u.x + Math.cos(u.face) * mr, u.y + Math.sin(u.face) * mr, mh), 1);
    return;
  }
  if (u.cls === 'air') {
    const alt = u.alt || 0, hgt = alt / VK, s = hullSprite(u, pal);
    const [shx, shy] = fromView(hgt * SHADOW_DX, hgt * SHADOW_DY * VIEW.F), [ux, uy] = liftPt(u.x, u.y, alt);   // (the shadow falls away from the sun, which is fixed to the camera)
    if (s.sh) { g.globalAlpha = 0.38; g.drawImage(s.sh, Math.round(u.x + shx + s.sox), Math.round(u.y + shy + s.soy)); g.globalAlpha = 1; }
    blit(g, s, ux, uy, false);
    if (u.def.fly === 'heli') {
      // The rotor turns faster than any screen can show, so each frame it advances as far as it
      // can without seeming to run backwards (under half the gap between blades, whatever the
      // frame rate) and the blur of the arc it swept fills in the rest.
      const five = u.type === 'hind' || u.type === 'comanche', flying = alt > 1;
      const dtf = u.rotT === undefined ? 0 : Math.min(0.1, Math.max(0, t - u.rotT));
      // Each rotor: [distance forward of the middle, hub height, radius, blades, turning way]. The Chinook's two turn opposite ways.
      const rotors = ROTORS[u.type] || [[0, u.type === 'comanche' ? 12 : five ? 10 : 9, u.type === 'hind' ? 15 : 13, five ? 5 : 4, 1]];
      const adv = Math.min((flying ? 80 : 6) * dtf, Math.PI * 2 / Math.max(...rotors.map((r) => r[3])) * 0.42);
      u.rotT = t; u.rotA = (u.rotA === undefined ? u.id : u.rotA) + adv;
      let rx, ry;
      for (const [fwd, hz, R, n, way] of rotors) {
        const gap = Math.PI * 2 / n, step = adv * way;
        [rx, ry] = liftPt(u.x + Math.cos(u.face) * fwd, u.y + Math.sin(u.face) * fwd, alt + hz * VK);
        g.fillStyle = flying ? 'rgba(40,40,36,0.26)' : 'rgba(0,0,0,0)';
        g.beginPath(); g.ellipse(rx, ry, R, R * 0.92, 0, 0, 7); g.fill();
        g.lineWidth = 1.2;
        const trails = flying ? 4 : 1;
        for (let c = trails - 1; c >= 0; c--) {
          g.strokeStyle = `rgba(28,28,24,${c ? 0.32 * (1 - c / trails) : 0.85})`;
          g.beginPath();
          for (let k = 0; k < n; k++) {
            const a = u.rotA * way - c * step / trails * 1.6 + k * gap;
            g.moveTo(rx, ry); g.lineTo(rx + Math.cos(a) * R, ry + Math.sin(a) * R * 0.92);
          }
          g.stroke();
        }
      }
      if (u.def.lift) cargoPips(g, u);
      if (u.type === 'heli') {   // the Longbow radar dome on top of the mast
        g.fillStyle = '#4c5149'; g.beginPath(); g.ellipse(rx, ry - 1.5, 2.6, 1.9, 0, 0, 7); g.fill();
        g.fillStyle = '#6b7166'; g.beginPath(); g.ellipse(rx - 0.5, ry - 2.1, 1.4, 0.9, 0, 0, 7); g.fill();
      }
    } else if (u.moving && u.def.type !== 'transport') {   // (the paratrooper transports have propellers: no jet flame)
      const [bx, by] = liftPt(u.x - Math.cos(u.face) * 15, u.y - Math.sin(u.face) * 15, alt + 2);   // behind the tail, at the jet's height
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,210,110,0.9)' : 'rgba(255,140,50,0.9)';
      g.beginPath(); g.arc(bx, by, 1.6, 0, 7); g.fill();
    }
    if (u.fireT > 0) flash(g, ...liftPt(u.x + Math.cos(u.face) * 10, u.y + Math.sin(u.face) * 10, alt), 2);
    // Parked: ammunition pips fill up as the ground crew rearms it.
    // Repairs under way: the same blinking green cross as structures.
    // Both drawn standing up at the aircraft's spot (standAt): on the turned view a row of pixels laid out in world
    // coordinates would run off along the diagonal while its backing stayed level (a stray black bar).
    if (u.repairing && Math.floor(t * 3) % 2) standAt(g, u.x, u.y, 0, () => {
      const cx = Math.round(u.x), cy = Math.round(u.y - 14);
      g.fillStyle = '#000'; g.fillRect(cx - 4, cy - 4, 9, 9);
      g.fillStyle = '#3ed04a'; g.fillRect(cx - 3, cy - 1, 7, 3); g.fillRect(cx - 1, cy - 3, 3, 7);
    });
    // Yellow: main weapon, blue: air-to-air missiles, grey: gun runs. A load of more than 6 (the Comanche's 15 gun
    // bursts) is a gauge 6 pips long, filled in proportion.
    if (u.as === 'landed' && u.def.weapon) standAt(g, u.x, u.y, 0, () => {
      const loads = [[u.def.weapon.ammo, u.ammo, '#e8c64a'], [u.def.weapon2 ? u.def.weapon2.ammo : 0, u.aam || 0, '#9cc8ff'], [u.def.gun ? u.def.gun.runs : 0, u.guns || 0, '#b8b6aa']].filter((l) => l[0] > 0);
      const len = (l) => Math.min(6, l[0]) * 3;
      const w = loads.reduce((s, l) => s + len(l), 0) + (loads.length - 1), x0 = Math.round(u.x - w / 2), y0 = Math.round(u.y + 9);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x0 - 1, y0 - 1, w + 1, 4);
      let x = x0;
      for (const [max, have, col] of loads) {
        if (max <= 6) for (let j = 0; j < max; j++) { g.fillStyle = j < have ? col : '#4a4436'; g.fillRect(x + j * 3, y0, 2, 2); }
        else { const full = Math.round((len([max]) - 1) * Math.max(0, have) / max); g.fillStyle = '#4a4436'; g.fillRect(x, y0, len([max]) - 1, 2); g.fillStyle = col; g.fillRect(x, y0, full, 2); }
        x += len([max]) + 1;
      }
    });
    return;
  }
  // A tank gun firing kicks the turret back along the barrel (recoil); the hull stays put.
  const rk = u.def.weapon && u.def.weapon.proj === 'shell' && !isAirborne(u) ? recoil(u) : 0;
  const kick = rk * (u.type === 'mammoth' || u.type === 'htank' ? 2 : 1.6);
  const hullAt = blit(g, hullSprite(u, pal), u.x, u.y);
  const ts = turretSprite(u, pal);
  if (ts) {
    const z = turretZ(u.def) * VK, off = u.def.draw === 'jeep' ? -3 : u.def.draw === 'apc' ? 0 : -1;
    const [lx, ly] = liftPt(u.x, u.y, z), tx = lx + Math.cos(u.face) * off - Math.cos(u.tface) * kick, ty = ly + Math.sin(u.face) * off - Math.sin(u.tface) * kick * 0.6;
    blit(g, ts, tx, ty, false, hullAt);   // (a whole-pixel offset from the hull: the turret stays put on it as the tank moves)
    if (u.fireT > 0) {
      const len = u.def.size.tur ? u.def.size.tur + u.def.size.barrel : 8;
      const side = u.def.weapon && u.def.weapon.stagger && u.barrel ? u.barrel * 1.6 : 0;   // a staggered twin gun: at the barrel that fired
      flash(g, tx + Math.cos(u.tface) * len + Math.sin(u.tface) * side, ty + Math.sin(u.tface) * len - Math.cos(u.tface) * side - 1.5, u.def.draw === 'jeep' || u.def.draw === 'apc' ? 1 : 2);
    }
  }
  if (u.def.apc) cargoPips(g, u);
  // On a Service Depot's pad: the blinking green cross, and sparks from the work.
  if (u.repairing) {
    if (Math.floor(t * 3) % 2) {
      const cx = Math.round(u.x), cy = Math.round(u.y - 16);
      g.fillStyle = '#000'; g.fillRect(cx - 4, cy - 4, 9, 9);
      g.fillStyle = '#3ed04a'; g.fillRect(cx - 3, cy - 1, 7, 3); g.fillRect(cx - 1, cy - 3, 3, 7);
    }
    if (Math.random() < 0.3) { g.fillStyle = Math.random() < 0.5 ? '#fff6c0' : '#ffb84a'; g.fillRect(Math.round(u.x + (Math.random() - 0.5) * 14), Math.round(u.y - 4 - Math.random() * 8), 1, 1); }
  }
}

// Paratrooper on the way down: shadow on the ground, swaying canopy above.
// Parachutes: the canopy with its lines and the shadow are pictures made once (chutePics), drawn as images. As paths
// (ellipses, strokes) every one was cut out of WebGL's 2D layer and uploaded each frame: 20 troopers in the air cost
// ~50 ms a frame (owner's match 3adc0dcf: 29-34 ms frames in units during drops).
let chutePicsC = null;
function chutePics() {
  if (chutePicsC) return chutePicsC;
  // Canopy: drawn as before about (x, cy) = (12, 8) in its picture; the lines run down to y - 18 = cy + 13.
  const can = mkCanvas(24, 23), c = can.getContext('2d'), x = 12, cy = 8, y = cy + 31;
  c.strokeStyle = '#2a2620'; c.lineWidth = 0.8;
  c.beginPath();
  for (const dx of [-9, -4, 4, 9]) { c.moveTo(x + dx, cy + 1); c.lineTo(x + dx * 0.15, y - 18); }
  c.stroke();
  c.fillStyle = '#d9d2bc';
  c.beginPath(); c.ellipse(x, cy, 10, 7, 0, Math.PI, 0); c.fill();
  c.fillStyle = '#a69d82';
  c.beginPath(); c.ellipse(x, cy, 10, 2, 0, 0, Math.PI); c.fill();
  c.fillRect(x - 1, cy - 7, 2, 7);
  // Shadow: an ellipse 12 x 6 (x INF_SCALE) on the ground, at 4 px a unit so it stays round when zoomed in.
  const Q = 4, sw = Math.ceil(12 * INF_SCALE * Q), sh = Math.ceil(6 * INF_SCALE * Q), sc = mkCanvas(sw, sh), s2 = sc.getContext('2d');
  s2.fillStyle = 'rgba(0,0,0,0.25)'; s2.beginPath(); s2.ellipse(sw / 2, sh / 2, sw / 2, sh / 2, 0, 0, 7); s2.fill();
  return (chutePicsC = { can, cx: x, cy, shadow: sc, sw: sw / Q, sh: sh / Q });
}
function drawChute(g, u, pal, t) {
  const h = u.chute * 26, sway = Math.sin(t * 2.4 + u.id) * 2, [wx, wy] = liftPt(u.x, u.y, h), P = chutePics();
  { const up = g.upright; g.upright = false; g.drawImage(P.shadow, u.x - P.sw / 2, u.y - P.sh / 2, P.sw, P.sh); g.upright = up; }   // (flat on the ground, as the path was)
  blit(g, infSprite(u, pal, 0), wx + sway, wy);
  // The canopy and lines, upright on the screen above him (the iso view: drawn in screen pixels from his spot).
  const m = g.getTransform(), x = Math.round(m.a * wx + m.c * wy + m.e) + sway, y = Math.round(m.b * wx + m.d * wy + m.f);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); const up = g.upright; g.upright = false;
  g.drawImage(P.can, x - P.cx, y - 31 - P.cy);
  g.upright = up; g.restore();
}

// A green pip for each soldier aboard a transport or APC (own alliance only).
function cargoPips(g, u) {
  if (!u.cargo || !u.cargo.length || !alliedSides(u.team, G.me)) return;
  standAt(g, u.x, u.y, 0, () => {
    const n = u.def.carry, x0 = Math.round(u.x - n * 1.5), y0 = Math.round(u.y + 12);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x0 - 1, y0 - 1, n * 3 + 1, 4);
    for (let j = 0; j < n; j++) { g.fillStyle = j < u.cargo.length ? '#7ee06a' : '#4a4436'; g.fillRect(x0 + j * 3, y0, 2, 2); }
  });
}
// Burnt-out wreck: the same model with charred paint.
function drawHusk(g, fx) {
  const fake = { def: fx.def, face: fx.face, tface: fx.tface, load: 0 };
  g.globalAlpha = Math.min(1, (1 - fx.t / fx.life) * 4);
  blit(g, hullSprite(fake, BURNT), fx.x, fx.y);
  const ts = turretSprite(fake, BURNT);
  if (ts) blit(g, ts, ...liftPt(fx.x, fx.y, turretZ(fx.def) * VK), false);
  g.globalAlpha = 1;
}

// Camouflage: the colour of the ground a structure was built on, taken from the terrain map (the
// picture under it is already covered by the building's dirt pad). Grass and dirt mix by how much
// dirt is around, in a few steps so only a handful of sprite variants are ever built.
const groundMemo = new WeakMap();
function groundColour(b) {
  let c = groundMemo.get(b);
  if (c !== undefined) return c;
  let f = 0, w = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = b.cx + dx, y = b.cy + dy, k = dx || dy ? 1 : 3;
    if (inMap(x, y)) { w += k; if (G.terr[idx(x, y)] === 1) f += k; }
  }
  const t = Math.round((w ? f / w : 0) * 4) / 4, GR = snowy() ? [196, 205, 218] : [50, 64, 38], EA = snowy() ? [128, 124, 120] : [92, 78, 55];
  c = (Math.round(GR[0] + (EA[0] - GR[0]) * t) << 16) | (Math.round(GR[1] + (EA[1] - GR[1]) * t) << 8) | Math.round(GR[2] + (EA[2] - GR[2]) * t);
  groundMemo.set(b, c);
  return c;
}
// ---------------------------------------------------------------------------
// Turning parts (models.js SPINNERS): the Soviet radar's dish. Looks only: the angle is kept here by building id, never on the building.
// ---------------------------------------------------------------------------
const DISH_SPEED = 0.9;   // radians a second (one turn in about 7 s)
const dishAngles = new Map();   // building id -> { a, t }
function dishAngle(b, stage) {
  let d = dishAngles.get(b.id);
  if (!d) {
    if (dishAngles.size > 64) for (const id of dishAngles.keys()) if (!G.byId.has(id)) dishAngles.delete(id);
    d = { a: b.id * 1.7, t: G.t }; dishAngles.set(b.id, d);
  }
  const low = G.teams[b.team] && G.teams[b.team].low;
  if (!(stage >= 2 || low)) d.a += DISH_SPEED * Math.max(0, Math.min(0.25, G.t - d.t));
  d.t = G.t;
  return d.a;
}

// ---------------------------------------------------------------------------
// The Construction Yard's tower crane (models.js SPINNERS.cy, CRANE_HOOK). Looks only, kept here by building id: when its side
// places a structure within CRANE_REACH, the jib swings round to it (the jib points along -x, so angle 0 is its rest), the hook
// runs down while the structure goes up, then comes up and the jib swings home. Worked out on each phone from what it sees.
// ---------------------------------------------------------------------------
const CRANE_SPEED = 2.4, CRANE_REACH = 16 * CELL, CRANE_HOLD = 2, CRANE_HOOK_SPEED = 40;   // rad/s, px, s, voxels a second
const craneStates = new Map();   // building id -> { a, hook, t, aim, until, busy }
function craneState(b, px, py, stage) {
  let c = craneStates.get(b.id);
  const rest = CRANE_HOOK[b.faction][1];
  if (!c) {
    if (craneStates.size > 64) for (const id of craneStates.keys()) if (!G.byId.has(id)) craneStates.delete(id);
    c = { a: 0, hook: rest, t: G.t, aim: 0, until: -1, busy: false }; craneStates.set(b.id, c);
  }
  const dt = Math.max(0, Math.min(0.25, G.t - c.t)); c.t = G.t;
  if (stage >= 2) return c;   // wrecked: it stands still
  // The newest structure of this side going up within reach.
  let best = null;
  for (const e of G.entities) {
    if (e.kind !== 'bld' || e === b || !e.alive || e.team !== b.team || !(e.buildT < 1) || e.sellT > 0) continue;
    const ex = (e.cx + e.w / 2) * CELL, ey = (e.cy + e.h / 2) * CELL;
    if ((ex - px) ** 2 + (ey - py) ** 2 > CRANE_REACH * CRANE_REACH || (best && e.id < best.id)) continue;
    best = e; c.tx = ex; c.ty = ey;
  }
  if (best) { c.aim = Math.atan2(c.ty - py, c.tx - px) + Math.PI; c.until = G.t + CRANE_HOLD; }
  c.busy = G.t < c.until;
  const goal = c.busy ? c.aim : 0;
  let d = goal - c.a; d = Math.atan2(Math.sin(d), Math.cos(d));
  const hk = CRANE_HOOK[b.faction], high = SPINNERS.cy[b.faction][3] - 4;
  // Swing only with the hook up; lower it once the jib is over the work.
  if (Math.abs(d) > 0.3 && c.hook < high - 3) c.hook = Math.min(high, c.hook + CRANE_HOOK_SPEED * dt);
  else {
    c.a += Math.sign(d) * Math.min(Math.abs(d), CRANE_SPEED * dt);
    let want = rest;
    if (c.busy) {   // working: the hook runs up and down (down to the ground beside the yard, never into its own roof)
      const hx = px - Math.cos(c.a) * hk[0] - b.cx * CELL, hy = py - Math.sin(c.a) * hk[0] - b.cy * CELL;
      const low = hx > 2 && hx < b.w * CELL - 2 && hy > 4 && hy < b.h * CELL - 16 ? hk[2] : 6;
      want = low + (high - low) * (0.5 - 0.5 * Math.cos(G.t * 2.6 + b.id));
    }
    if (Math.abs(d) > 0.3) want = high;
    c.hook += Math.sign(want - c.hook) * Math.min(Math.abs(want - c.hook), CRANE_HOOK_SPEED * dt);
  }
  return c;
}
// The hook's cable and block hang from the trolley out along the jib; an amber lamp blinks at the jib's tip while it works.
function drawCraneHook(g, b, c, px, py, pz) {
  const hk = CRANE_HOOK[b.faction], ca = Math.cos(c.a), sa = Math.sin(c.a);
  const hx = px - ca * hk[0], hy = py - sa * hk[0];
  const [x0, y0] = liftPt(hx, hy, (pz - 1) * VK), [x1, y1] = liftPt(hx, hy, c.hook * VK);
  g.strokeStyle = '#141412'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.fillStyle = '#3a3c36'; g.fillRect(x1 - 2, y1 - 1, 4, 3);
  g.fillStyle = '#d8b030'; g.fillRect(x1 - 0.5, y1 + 2, 1, 2);
  if (c.busy && Math.floor(G.t * 2.5) % 2) {
    const L = b.faction === 'soviets' ? 33 : 37, [lx, ly] = liftPt(px - ca * L, py - sa * L, (pz + 3.5) * VK);
    g.fillStyle = 'rgba(255,170,40,0.95)'; g.beginPath(); g.arc(lx, ly, 1.3, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,170,40,0.25)'; g.beginPath(); g.arc(lx, ly, 3.2, 0, 7); g.fill();
  }
}

// ---------------------------------------------------------------------------
// Build-up and selling in the iso view: the footprint's pad (a diamond), a scaffold of poles and rails standing at its
// corners, the structure's own model cut off at a rising height (models.js buildSprite), welding sparks at the top and a
// sheen when it is done. Everything is worked out from k, the building's id and the battle clock, so it looks the same
// however often it is drawn; the only things kept are the sprites. k runs 0 to 1 going up and back down when selling.
// ---------------------------------------------------------------------------
let buildSweepT = 0;
function drawBuildUp(g, b, s, x, y, k, selling, camo) {
  const W = b.w * CELL, Hh = b.h * CELL, H = picH(s.img), up = g.upright;
  const pal = palFor(b.faction), soviet = b.faction === 'soviets';
  const mdl = modelCache.get('S' + b.type + camoPal(b.faction, camo).key);
  const hFull = (mdl ? mdl.d : H / VK) * VK, hb = hFull * k + 3;
  const A = [x, y], B = [x + W, y], C = [x, y + Hh], D = [x + W, y + Hh];   // back, right, left and front corners of the diamond
  if (performance.now() - buildSweepT > 5000) { buildSweepT = performance.now(); dropBuildSprites(); }
  // Pad and dust.
  g.upright = false;
  const pc = camo !== undefined ? '#' + (camo | 0x1000000).toString(16).slice(1) : '#000';
  g.globalAlpha = (camo !== undefined ? 0.5 : 0.3) * Math.min(1, k / 0.15);
  g.fillStyle = pc; g.fillRect(x, y, W, Hh);
  g.globalAlpha = 0.8 * Math.min(1, k / 0.15);
  g.strokeStyle = pal.main; g.lineWidth = 1; g.setLineDash([4, 3]); g.strokeRect(x + 0.5, y + 0.5, W - 1, Hh - 1); g.setLineDash([]);
  g.globalAlpha = 1; g.upright = up;
  if (!selling && k < 0.12) {
    const dk = k / 0.12;
    for (const [cx, cy] of [A, B, C, D]) standAt(g, cx, cy, 2 + dk * 5, () => { g.fillStyle = `rgba(190,175,150,${0.5 * (1 - dk)})`; g.beginPath(); g.arc(cx, cy, 2 + dk * 5, 0, 7); g.fill(); });
  }
  // Scaffold: poles at the corners and rails every 8 px, the back two sides before the building and the front two after it.
  const fade = k < 0.85 ? 1 : Math.max(0, (1 - k) / 0.15);
  const pole = soviet ? '#9c3a2a' : '#d8b13a', rail = soviet ? '#8a8d8a' : '#e6c960';
  const pl = (P, h0, h1) => { const [x0, y0] = liftPt(P[0], P[1], h0), [x1, y1] = liftPt(P[0], P[1], h1); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const rl = (P, Q, h) => { const [x0, y0] = liftPt(P[0], P[1], h), [x1, y1] = liftPt(Q[0], Q[1], h); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const scaffold = (poles, rails) => {
    if (fade <= 0) return;
    g.globalAlpha = fade; g.lineWidth = 1.2;
    g.strokeStyle = pole; for (const P of poles) pl(P, 0, hb);
    g.strokeStyle = rail; for (let h = 8; h <= hb; h += 8) for (const [P, Q] of rails) rl(P, Q, h);
    g.globalAlpha = 1; g.lineWidth = 1;
  };
  scaffold([A, B, C], [[A, B], [A, C]]);
  // The structure: its own model cut at the current height, or until that is made, sunk into its pad.
  const step = Math.min(BUILD_STEPS - 1, Math.floor(k * BUILD_STEPS)), layer = buildSprite(b.type, b.faction, step, camo);
  if (layer) blit(g, layer, x, y);
  else {
    g.save(); g.beginPath();
    const top = hFull + 40;
    for (const P of [C, D, B]) { if (P === C) g.moveTo(P[0], P[1]); else g.lineTo(P[0], P[1]); }
    g.lineTo(...liftPt(B[0], B[1], top)); g.lineTo(...liftPt(C[0], C[1], top)); g.closePath(); g.clip();
    blit(g, s, ...liftPt(x, y, -(1 - k) * H), false);
    g.restore();
  }
  // The dish only appears when the build is done, so make its facings now (a few a frame): it then turns from the first frame.
  const sp = SPINNERS[b.type] && SPINNERS[b.type][b.faction];
  if (sp) for (let j = 0; j < 4; j++) spinnerSprite(b.type, b.faction, (((G.t * 60 | 0) * 4 + j) % FACINGS) * Math.PI * 2 / FACINGS, 0);
  scaffold([D], [[B, D], [C, D]]);
  // Welding sparks along the top edge.
  if (!selling || k < 1) {
    const n = 6 + (b.id % 5), f = Math.floor(G.t * 14);
    for (let i = 0; i < n; i++) {
      const e = hash3(b.id, f, i), r = hash3(i, b.id, f + 7), side = Math.floor(e * 4) % 4, t = (e * 7) % 1;
      const [P, Q] = [[A, B], [B, D], [D, C], [C, A]][side];
      const px = P[0] + (Q[0] - P[0]) * t, py = P[1] + (Q[1] - P[1]) * t;
      standAt(g, px, py, hb + r * 3, () => { g.fillStyle = r > 0.5 ? '#fff6c0' : '#ffb030'; g.fillRect(Math.round(px), Math.round(py), 1, 1); });
    }
  }
  // A short white sheen across the finished structure.
  if (!selling && k >= 0.85) {
    const t = (k - 0.85) / 0.15, [XA] = toView(C[0], C[1]), [XB] = toView(B[0], B[1]), [, Yf] = toView(D[0], D[1]);
    const xc = XA + (XB - XA + 20) * t - 10, wd = Math.max(8, (XB - XA) * 0.14), ytop = Yf - hFull - 8, ybot = Yf + 6;
    const pts = [[xc - wd + 10, ytop], [xc + wd + 10, ytop], [xc + wd - 10, ybot], [xc - wd - 10, ybot]].map(([X, Y]) => fromView(X, Y));
    g.save(); g.beginPath(); pts.forEach((P, i) => (i ? g.lineTo(P[0], P[1]) : g.moveTo(P[0], P[1]))); g.closePath(); g.clip();
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 * (1 - t);
    blit(g, layer || s, x, y, false);
    g.restore();
  }
}
// A sprite in solid red, its own shape (for a structure flashing red under a charge); made once per sprite.
const RED_SPR = new WeakMap();
function redSprite(s) {
  let r = RED_SPR.get(s);
  if (r) return r;
  const c = document.createElement('canvas'); c.width = s.img.width; c.height = s.img.height; c._k = s.img._k;
  const x = c.getContext('2d'); x.drawImage(s.img, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#ff2a1e'; x.fillRect(0, 0, c.width, c.height);
  r = { img: c, ox: s.ox, oy: s.oy };
  RED_SPR.set(s, r);
  return r;
}
function drawStructure(g, b, t) {
  drawVar = G.teams[b.team].variant | 0;
  const camo = b.type === 'pillbox' ? groundColour(b) : undefined;
  const s = structureSprite(b.type, b.faction, camo);
  const x = b.cx * CELL, y = b.cy * CELL;
  let k = b.buildT;
  if (b.sellT > 0) k = Math.min(k, b.sellT / 1.2);
  if (k < 1) { drawBuildUp(g, b, s, x, y, k, b.sellT > 0, camo); return; }
  const stage = dmgStage(b), body = stage ? damagedSprite(b.type, b.faction, stage, camo) : s;
  blit(g, body, x, y);
  // A Specialist's charge on it (world.js demolish): the whole structure flashes red, faster as the fuse runs down (both sides see it).
  if (b.c4T > G.t) {
    const left = Math.max(0, Math.min(1, (b.c4T - G.t) / SPEC_FUSE)), ph = (G.t * (1.5 + (1 - left) * 6)) % 1;
    g.globalAlpha = 0.7 * (0.5 - 0.5 * Math.cos(ph * Math.PI * 2));
    if (g.globalAlpha > 0.01) blit(g, redSprite(body), x, y, false);
    g.globalAlpha = 1;
  }
  if (b.type === 'factory' && b.doorAt != null) {   // the door rolls up for a new unit (world.js spawnUnit)
    const k = doorOpen(G.t - b.doorAt), step = Math.round(k * DOOR_STEPS);
    if (step > 0) blit(g, factoryDoorSprite(b.faction, step), x, y, false);
  }
  const head = HEADS[b.type];
  if (b.type === 'sam') drawSamHead(g, b, x, y, stage);
  else if (head) {
    const kick = b.type === 'turret' ? recoil(b) * 1.6 : 0;   // the Gun Turret's head kicks back when it fires
    const [lx, ly] = liftPt(x + head[1], y + head[2], head[3] * VK), hx = lx - Math.cos(b.tface) * kick, hy = ly - Math.sin(b.tface) * kick * 0.6;
    blit(g, headSprite(b.type, b.faction, b.tface, stage), hx, hy, false);
    if (b.type === 'ftur') {   // a burst of fire at the projector's mouth, not a gun flash
      if (b.fireT > 0) { g.fillStyle = 'rgba(255,140,40,0.85)'; g.beginPath(); g.arc(hx + Math.cos(b.tface) * 10, hy + Math.sin(b.tface) * 10 - 3, 4 + Math.random() * 2, 0, 7); g.fill(); }
    } else if (b.fireT > 0) flash(g, hx + Math.cos(b.tface) * 14, hy + Math.sin(b.tface) * 14 - 2, 2);
  }
  const sp = SPINNERS[b.type] && SPINNERS[b.type][b.faction];
  if (sp) {   // a turning part that is not a weapon (the Soviet radar's dish, the yard's crane)
    const [lx, ly] = liftPt(x + sp[1], y + sp[2], sp[3] * VK);
    let a;
    if (b.type === 'cy') { const c = craneState(b, x + sp[1], y + sp[2], stage); a = c.a; drawCraneHook(g, b, c, x + sp[1], y + sp[2], sp[3]); }
    else a = dishAngle(b, stage);
    blit(g, spinnerSprite(b.type, b.faction, a, stage), lx, ly, false);
  }
  if (b.type === 'pillbox' && b.fireT > 0) { const m = muzzle(b); flash(g, ...liftPt(m.x, m.y + m.h, m.h), 2); }
  const fs = FLAG_SPOTS[b.type] && FLAG_SPOTS[b.type][b.faction];
  if (b.faction === 'soviets' && BANNERS[b.type]) drawBanners(g, b, x, y, palFor(b.faction));
  if (fs) { const pal = palFor(b.faction); standAt(g, x + fs[0], y + fs[1], fs[2] * VK, () => drawFlag(g, x + fs[0], y + fs[1], fs[3], fs[4], pal.main, pal.dark || pal.main, b.id, fs[5])); }
  if (b.type === 'tesla' && b.charge > 0) {
    g.fillStyle = `rgba(140,190,255,${0.25 + 0.45 * b.charge})`;
    g.beginPath(); g.arc(x + 12, y + 35 - 50 * VK, 7 + Math.random() * 3, 0, 7); g.fill();
  }
  if (b.repairing && Math.floor(t * 3) % 2) {
    const cx = Math.round(b.x), cy = Math.round(y + 4);
    g.fillStyle = '#000'; g.fillRect(cx - 4, cy - 4, 9, 9);
    g.fillStyle = '#3ed04a'; g.fillRect(cx - 3, cy - 1, 7, 3); g.fillRect(cx - 1, cy - 3, 3, 7);
  }
}

// A village house (world.js genVillage; models.js houseModel): neutral, so no side colours. Damaged copies as for any
// structure; a fallen house is only rubble in the ground.
function drawHouse(g, h) {
  drawVar = 0;
  const type = houseStructure(h.type), stage = dmgStage(h), s = structureSprite(type, 'allies');
  const fort = h.n ? fortSprite(type, stage) : null;   // held: sandbags and wire (models.js fortifyModel)
  blit(g, fort || (stage ? damagedSprite(type, 'allies', stage) : s), h.cx * CELL, h.cy * CELL);
  if (type.startsWith('hv:fountain') && stage < 2) fountainWater(g, h);
  // Held by a side: its flag on the roof, and for your own side's houses (and allies') a pip per soldier inside.
  if (h.n && G.teams[h.team]) {
    const t = G.teams[h.team], keep = drawVar; drawVar = t.variant | 0;
    const col = palFor(t.faction).main; drawVar = keep;
    const fi = FORT_INFO.get(type), fl = fi && fi.flag, wx = fl ? h.cx * CELL + fl.x : h.x, wy = fl ? h.cy * CELL + fl.y : h.y, hz = fl ? fl.z * VK : 24;
    standAt(g, wx, wy, hz, () => {
    const x = Math.round(wx), y = Math.round(wy), wave = Math.sin(G.t * 5 + h.id) > 0 ? 1 : 0;
    g.fillStyle = '#1c1c1a'; g.fillRect(x, y - 16, 2, 18);
    const tp = G.teams[h.team]; drawVar = tp.variant | 0; const dark = palFor(tp.faction).dark || col; drawVar = keep;
    drawFlag(g, x + 1, y - 16, 11, 6, col, dark, h.id, false);
    if (alliedSides(h.team, G.me) || G.watching) {
      for (let i = 0; i < h.n; i++) { g.fillStyle = '#000'; g.fillRect(x - 1 + i * 3 - h.n * 1.5, y + 4, 3, 3); g.fillStyle = '#3ed04a'; g.fillRect(x + i * 3 - h.n * 1.5, y + 5, 1, 1); }
    }
    });
  }
}
// The fountain's water: jets from the spout falling into the upper bowl, from the bowl's rim into the basin, and rings
// spreading on the water.
function fountainWater(g, h) {
  const m = modelCache.get('S' + h.type + 'allies');
  if (!m) return;
  const cx = h.x, cy = h.y, t = G.t;
  g.fillStyle = 'rgba(214,234,250,0.85)';
  for (let i = 0; i < 10; i++) {   // the top jet
    const k = (t * 1.3 + i / 10) % 1, a = i * 0.63;
    const r = 2 + k * 6, z = m.spout + 6 * k - 10 * k * k;
    const [px, py] = liftPt(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z * VK); g.fillRect(Math.round(px), Math.round(py), 1, 1);
  }
  g.fillStyle = 'rgba(190,220,245,0.7)';
  for (let i = 0; i < 28; i++) {   // over the wide bowl's rim
    const k = (t * 1.1 + i * 0.37) % 1, a = i * (Math.PI * 2 / 28);
    const r = 15 + k * 6, z = m.bowl + 1 - 13 * k * k;
    if (z < 3) continue;
    const [px, py] = liftPt(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z * VK); g.fillRect(Math.round(px), Math.round(py), 1, 2);
  }
  g.strokeStyle = 'rgba(220,238,255,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 3; i++) {   // rings on the basin
    const k = (t * 0.45 + i / 3) % 1, r = 22 + k * (m.R - 24);
    g.globalAlpha = 1 - k; g.beginPath(); g.ellipse(...liftPt(cx, cy, 4 * VK), r, r, 0, 0, Math.PI * 2); g.stroke();   // (on the water: turned and squashed with the ground)
  }
  g.globalAlpha = 1;
}
// Village props (world.js villageProps): a lamp's light is drawn over it.
let lampGlowPic = null;
function drawProp(g, p) {
  if (p.k === 'laundry') { drawLaundry(g, p); return; }
  if (p.k === 'boat' || p.k === 'nets') {   // (Heron Fen's fishing village; models here, so the baked sprites' hash of models.js stays)
    const s = sprite('P' + p.k + (p.v | 0) + (p.up ? 'u' : 'd'), () => fishPropModel(p.k, p.v | 0, p.up), 0, 0);
    blit(g, s, p.x, p.y + (p.k === 'boat' && p.up ? Math.round(Math.sin(G.t * 1.3 + p.x * 0.07) * 0.6) : 0));   // the boats bob a little
    return;
  }
  const s = propSprite(p);
  blit(g, s, p.x, p.y);
  if (p.k === 'lamp' && p.up) {
    if (!lampGlowPic) {
      lampGlowPic = mkCanvas(40, 40);
      const c = lampGlowPic.getContext('2d'), gr = c.createRadialGradient(20, 20, 0, 20, 20, 20);
      gr.addColorStop(0, 'rgba(255,220,140,0.55)'); gr.addColorStop(0.35, 'rgba(255,200,110,0.18)'); gr.addColorStop(1, 'rgba(255,190,100,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 40, 40);
    }
    const flick = (0.75 + 0.25 * Math.sin(G.t * 9 + p.x) * Math.sin(G.t * 3.7 + p.y)) * (0.35 + 0.65 * nightLevel());   // faint by day
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = flick;
    const [lx, ly] = liftPt(p.x + 4.5, p.y, 17 * VK);   // (pictures stand at their middle: uprightCtx)
    g.drawImage(lampGlowPic, lx - 12, ly - 12, 24, 24);
    g.globalAlpha = 0.35 * flick; g.drawImage(lampGlowPic, p.x + 4 - 18, p.y + 1 - 10, 36, 20);   // the pool of light on the ground
    g.restore();
  }
}
// A rowboat (v 0: along x, 1: along y; knocked over: swamped, only its gunwale and an oar showing) or nets drying on a
// frame of poles (knocked over: in a heap). Voxel models like the other village props (models.js propModel).
function fishPropModel(kind, v, up) {
  const m = new VModel(-18, -18, 18, 18, 22), wood = '#6e5434', woodD = '#4c3a24', woodL = '#8a6c44';
  const B = (x0, y0, z0, x1, y1, z1, c, mt) => (v % 2 ? m.box(y0, x0, z0, y1, x1, z1, c, mt) : m.box(x0, y0, z0, x1, y1, z1, c, mt));
  if (kind === 'boat') {
    const half = (x) => Math.max(0, 4.6 * Math.sqrt(Math.max(0, 1 - (x / 13) ** 2)) - (x > 8 ? (x - 8) * 0.35 : 0));   // the hull's half beam along it
    if (up) {
      for (let x = -13; x <= 13; x++) {
        const w = Math.round(half(x + 0.5));
        if (w < 1) continue;
        B(x, -w, 0, x + 1, w, 1, woodD, M_ROUGH);                    // the bottom, at the waterline
        B(x, -w, 1, x + 1, -w + 1, 4, wood, M_ROUGH); B(x, w - 1, 1, x + 1, w, 4, wood, M_ROUGH);   // the sides
        B(x, -w, 4, x + 1, -w + 1, 5, woodL, M_ROUGH); B(x, w - 1, 4, x + 1, w, 5, woodL, M_ROUGH); // the gunwale
        B(x, -w + 1, 1, x + 1, w - 1, 2, '#3a4a3a', M_GLASS);        // bilge water
      }
      B(-13, -1, 1, -12, 1, 5, woodD, M_ROUGH); B(12, -1, 1, 13, 1, 6, woodD, M_ROUGH);   // stern and stem
      for (const x of [-6, 2]) B(x, -4, 3, x + 2, 4, 4, woodL, M_ROUGH);                    // thwarts
      B(-4, -9, 4, 5, -8, 5, '#9a8058', M_ROUGH); B(-3, 8, 4, 6, 9, 5, '#9a8058', M_ROUGH);  // oars shipped over the sides
      B(9, -2, 4, 12, 2, 5, '#6a7a5a', M_MATTE);                                            // a heap of net in the bow
    } else {
      for (let x = -12; x <= 12; x++) { const w = Math.round(half(x + 0.5)); if (w >= 1) { B(x, -w, 0, x + 1, -w + 1, 1, woodL, M_ROUGH); B(x, w - 1, 0, x + 1, w, 1, woodL, M_ROUGH); } }
      B(-3, 7, 0, 8, 8, 1, '#9a8058', M_ROUGH);
    }
  } else {   // nets
    if (up) {
      for (const x of [-12, 0, 12]) { B(x, 0, 0, x + 1, 1, 16, woodD, M_ROUGH); }
      B(-12, 0, 15, 13, 1, 16, wood, M_ROUGH);
      for (let x = -11; x < 12; x++) for (let z = 4; z < 15; z++) {
        const sag = Math.round(Math.sin(((x + 12) % 12) / 12 * Math.PI) * 2.5);
        if (z < 4 + sag) continue;
        if ((x + z) % 2 === 0 || z === 14) B(x, 0, z, x + 1, 1, z + 1, (x * 7 + z * 3) % 11 === 0 ? '#c8a040' : '#5f6e5a', M_MATTE);   // mesh, a cork float here and there
      }
      B(-9, 2, 0, -3, 6, 2, '#6a7a5a', M_MATTE); B(-8, 3, 2, -4, 5, 3, '#6a7a5a', M_MATTE);   // a pile of net on the ground
      B(5, 2, 0, 10, 6, 3, '#7a5a3a', M_ROUGH); B(5, 2, 3, 10, 3, 4, woodD, M_ROUGH);           // a fish basket
    } else {
      B(-12, -1, 0, 13, 1, 1, woodD, M_ROUGH);
      for (let i = 0; i < 16; i++) B(-10 + i, -4 + ((i * 5) % 8), 0, -9 + i, -3 + ((i * 5) % 8), 1, '#5f6e5a', M_MATTE);
    }
  }
  return m;
}
// Washing on a line in front of a house, swaying in the wind; gone while the house is held or down, on the ground
// once knocked over.
const CLOTHES = ['#e8e4da', '#c9d8e8', '#b8302a', '#3a5a8a', '#e0c070', '#d8a8b8', '#f2f0ea', '#6a8a4a'];
function drawLaundry(g, p) {
  const h = G.byId.get(p.h);
  if (!h || !h.alive || h.n) return;
  standAt(g, p.x, p.y, 0, () => laundryPixels(g, p));
}
function laundryPixels(g, p) {
  const x0 = Math.round(p.x - p.w / 2), x1 = Math.round(p.x + p.w / 2), y = Math.round(p.y - 5), top = y - 11;
  if (!p.up) { for (let i = 0; i < 5; i++) { g.fillStyle = CLOTHES[(p.v + i * 3) % CLOTHES.length]; g.fillRect(x0 + 4 + i * 7 + ((p.v >> i) & 3), y - 1 + ((p.v >> (i + 2)) & 3), 4, 2); } return; }
  const wind = typeof windNow === 'function' ? windNow() : { x: 4, y: 0 }, k = Math.max(-2, Math.min(2, wind.x * 0.25));
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x0, y + 1, x1 - x0, 1);   // the line's shadow
  g.fillStyle = '#5a4632'; g.fillRect(x0, top, 1, y - top + 1); g.fillRect(x1, top, 1, y - top + 1);   // posts
  const n = Math.max(3, Math.floor((x1 - x0) / 7));
  g.fillStyle = '#d8d4c8';   // the line: a run of pixels at each sag in one rectangle (the same pixels as one at a time)
  for (let i = 0, run = 0, ps = null; i <= x1 - x0 + 1; i++) {
    const sag = i <= x1 - x0 ? Math.round(Math.sin(i / (x1 - x0) * Math.PI) * 2) : null;
    if (sag !== ps && run) { g.fillRect(x0 + i - run, top + 1 + ps, run, 1); run = 0; }
    ps = sag; run++;
  }
  for (let i = 0; i < n; i++) {
    const cx = x0 + 3 + i * ((x1 - x0 - 6) / n), sag = Math.round(Math.sin((cx - x0) / (x1 - x0) * Math.PI) * 2);
    const sway = Math.round(k + Math.sin(G.t * 3 + i * 1.7 + p.v) * 0.8), w = 3 + ((p.v >> i) & 1), hh = 4 + ((p.v >> (i + 1)) & 3);
    g.fillStyle = CLOTHES[(p.v + i * 5) % CLOTHES.length];
    g.fillRect(Math.round(cx), top + 2 + sag, w, 2); g.fillRect(Math.round(cx) + sway, top + 4 + sag, w, hh - 2);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(Math.round(cx) + sway, top + 2 + sag + hh - 1, w, 1);
  }
}
// Old-style pixel drawing that stands up the screen (the iso view): fn draws in screen pixels laid out round world (x, y)
// as before, and that spot is put where world (x, y), h pixels up, shows.
function standAt(g, x, y, h, fn) {
  const [wx, wy] = liftPt(x, y, h), m = g.getTransform(), up = g.upright;
  g.save(); g.setTransform(1, 0, 0, 1, Math.round(m.a * wx + m.c * wy + m.e - x), Math.round(m.b * wx + m.d * wy + m.f - y)); g.upright = false;
  try { fn(); } finally { g.upright = up; g.restore(); }
}
// A villager (world.js moveFolk), a small figure drawn in pixels: hair, face, shirt and trousers or a skirt, legs
// stepping as they walk, arms up when they run.
const FOLK_LEGS = ['#3b3a36', '#4a3826', '#2f4766', '#5a4632', '#5a5a52'], FOLK_HAIR = ['#2a1d14', '#5a3a22', '#a07c4a', '#cfcac0', '#1c1c1a'], FOLK_SKIN = ['#e0b08c', '#c38d66', '#9a6a48', '#e8c0a0'];
function drawFolk(g, v) { standAt(g, v.x, v.y, 0, () => folkPixels(g, v)); }
function folkPixels(g, v) {
  const L = v.look, x = Math.round(v.x), y = Math.round(v.y), f = v.face;
  const shirt = FOLK_SHIRTS[L % FOLK_SHIRTS.length], legs = FOLK_LEGS[(L >> 3) % FOLK_LEGS.length], hair = FOLK_HAIR[(L >> 6) % FOLK_HAIR.length], skin = FOLK_SKIN[(L >> 9) % FOLK_SKIN.length];
  const skirt = (L >> 12) % 3 === 0, hat = (L >> 14) % 4 === 0, run = v.st === 'flee', moving = v.st !== 'idle';
  const s = moving ? Math.sin(v.ph * (run ? 2.2 : 1.6)) : 0, a = s > 0.3 ? 1 : s < -0.3 ? -1 : 0, bob = moving && Math.abs(s) > 0.7 ? -1 : 0;
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x - 2, y, 5, 1);
  if (skirt) { g.fillStyle = legs === '#3b3a36' ? '#7a3a4a' : legs; g.fillRect(x - 2, y - 5 + bob, 5, 4); g.fillStyle = '#2a2622'; g.fillRect(x - 1 + a, y - 1, 1, 1); g.fillRect(x + 1 - a, y - 1, 1, 1); }
  else { g.fillStyle = legs; g.fillRect(x - 1 + a, y - 5 + bob, 1, 5 - bob); g.fillRect(x + 1 - a, y - 5 + bob, 1, 5 - bob); g.fillRect(x - 1, y - 5 + bob, 3, 1); }
  g.fillStyle = shirt; g.fillRect(x - 2, y - 9 + bob, 5, 4);
  g.fillStyle = skin;
  if (run) { g.fillRect(x - 3, y - 11 + bob, 1, 3); g.fillRect(x + 3, y - 11 + bob, 1, 3); }   // arms up
  else { g.fillRect(x - 3, y - 8 + bob - a, 1, 3); g.fillRect(x + 3, y - 8 + bob + a, 1, 3); }
  g.fillRect(x - 1, y - 12 + bob, 3, 3);
  g.fillStyle = hair; g.fillRect(x - 1, y - 12 + bob, 3, 1); g.fillRect(x - (f > 0 ? 1 : -1), y - 11 + bob, 1, 1);
  if (hat) { g.fillStyle = (L >> 16) & 1 ? '#c9a95a' : '#3b3a36'; g.fillRect(x - 2, y - 13 + bob, 5, 1); g.fillRect(x - 1, y - 14 + bob, 3, 1); }
}
// A hen (world.js moveHens): white or brown, a red comb, wings out when she runs.
function drawHen(g, c) { standAt(g, c.x, c.y, 0, () => henPixels(g, c)); }
function henPixels(g, c) {
  const x = Math.round(c.x), y = Math.round(c.y), peck = !c.flap && Math.sin(c.ph * 2) > 0.7 ? 1 : 0, f = c.face;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 1, y, 4, 1);
  g.fillStyle = c.white ? '#ece8de' : '#9a5a2a'; g.fillRect(x - 1, y - 3, 4, 3);
  if (c.flap && Math.sin(c.ph) > 0) { g.fillRect(x - 2, y - 4, 1, 2); g.fillRect(x + 3, y - 4, 1, 2); }
  g.fillRect(x + (f > 0 ? 2 : -1), y - 4 + peck, 1, 2);
  g.fillStyle = '#c42a1a'; g.fillRect(x + (f > 0 ? 2 : -1), y - 5 + peck, 1, 1);
  g.fillStyle = '#d0a426'; g.fillRect(x + (f > 0 ? 3 : -2), y - 3 + peck, 1, 1);
}
// Pigeons (world.js villageLife): `air` false draws those sitting on the ground, true those flying or on a roof.
function drawBirds(g, air, x0, y0, x1, y1) {
  for (const f of G.birds || []) for (const b of f.birds) {
    if ((b.alt > 0) !== air || b.x < x0 || b.y < y0 || b.x > x1 || b.y > y1 || !G.seen[cellOfPos(Math.max(0, Math.min(WORLD - 1, b.x)), Math.max(0, Math.min(WORLD - 1, b.y)))]) continue;
    if (b.alt > 0 && f.st !== 0) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(Math.round(b.x), Math.round(b.y), 2, 1); }   // its shadow on the ground
    standAt(g, b.x, b.y, b.alt * VK, () => birdPixels(g, f, b));
  }
}
function birdPixels(g, f, b) {
  {
    const x = Math.round(b.x), y = Math.round(b.y);
    if (b.alt > 0 && f.st !== 0) {
      const up = Math.sin(b.ph) > 0;
      g.fillStyle = '#d6d6d2'; g.fillRect(x - 2, y - (up ? 1 : 0), 2, 1); g.fillRect(x + 1, y - (up ? 1 : 0), 2, 1);
      g.fillStyle = '#7d8088'; g.fillRect(x, y, 1, 1);
    } else {
      const peck = Math.sin(b.ph * 3) > 0.6 ? 1 : 0;
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x - 1, y + 1, 3, 1);
      g.fillStyle = '#80838c'; g.fillRect(x - 1, y - 1, 3, 2);
      g.fillStyle = '#5a5e66'; g.fillRect(x + (b.face > 0 ? 1 : -1), y - 2 + peck, 1, 1);
    }
  }
}

// Flags that fly in the wind (world.js windNow): the cloth streams downwind, waves faster and harder in a gust, droops
// when the wind drops, and swings round when it turns. Drawn live over the structure's sprite, whose model keeps only
// the pole. FLAG_SPOTS: per structure and faction, [pole x, y, top height, cloth length, cloth height, star].
const FLAG_SPOTS = {
  refinery: { allies: [4, 46.5, 22, 8, 5] },
  barracks: { allies: [45, 3.5, 30, 7, 5] },
  outpost: { allies: [39, 10.5, 22, 8, 5], soviets: [39, 10.5, 24, 9, 6, true] },
};
function drawFlag(g, px, py, len, hgt, col, dark, phase, star) {
  const w = windNow(), sp = Math.hypot(w.x, w.y) || 1, st = Math.max(0.2, Math.min(1, sp / (WIND * 1.3)));
  let ux = w.x / sp, uy = (w.y / sp) * 0.22;
  if (Math.abs(ux) < 0.6) ux = ux < 0 ? -0.6 : 0.6;   // blowing up or down the screen it is foreshortened, never a stub
  const droop = (1 - st) * 0.55, freq = 1.8 + st * 2.2, amp = 0.3 + st * 1.1;
  for (let i = 0; i < len; i++) {
    const k = i / len, wave = Math.sin(G.t * freq - i * 0.85 + phase) * amp * k, slope = Math.cos(G.t * freq - i * 0.85 + phase);
    const x = Math.round(px + ux * i * (0.6 + 0.4 * st)), y = Math.round(py + uy * i + droop * i + wave);
    g.fillStyle = slope > 0.35 ? shadeHex(col, 1.18) : slope < -0.35 ? dark : col;
    g.fillRect(x, y, 1, hgt - (i === len - 1 && st < 0.6 ? 1 : 0));
    if (star && i === 2) { g.fillStyle = '#e8c24a'; g.fillRect(x, y + (hgt >> 1) - 1, 1, 2); }
    if (star && (i === 1 || i === 3)) { g.fillStyle = '#e8c24a'; g.fillRect(x, y + (hgt >> 1) - 1, 1, 1); }
  }
}
// Banners on Soviet structures (models.js BANNERS): hung from a rod at the top, the cloth swings sideways with the wind,
// more toward its free end, with a ripple running down it; dark hem, gold star near the top.
function drawBanners(g, b, x, y, pal) {
  const list = BANNERS[b.type];
  if (!list) return;
  const w = windNow(), side = Math.max(-1, Math.min(1, w.x / (WIND * 1.2))), gust = Math.min(1, Math.hypot(w.x, w.y) / (WIND * 1.3));
  list.forEach(([x0, x1, fy, top, len], j) => {
    const ph = b.id * 1.7 + j * 2.1, cx = (x0 + x1) / 2;
    for (let r = 0; r < len; r++) {
      const k = (r + 1) / len, z = top - 1 - r;
      const dx = (side * 1.6 * k * k + Math.sin(G.t * (1 + gust * 1.1) + ph - r * 0.55) * (0.35 + gust * 0.75) * k);
      const ripple = Math.cos(G.t * (1 + gust * 1.1) + ph - r * 0.55);
      // Each row of cloth lies along its wall (the iso view turns the wall): a strip from its left to its right edge.
      const strip = (u0, u1, col) => {
        const m = g.getTransform(), P = (u, h) => { const [wx, wy] = liftPt(x + u + dx, y + fy + 1, h); return [m.a * wx + m.c * wy + m.e, m.b * wx + m.d * wy + m.f]; };
        const q = [P(u0, (z + 1) * VK), P(u1, (z + 1) * VK), P(u1, z * VK), P(u0, z * VK)], up = g.upright;
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.upright = false; g.fillStyle = col;
        g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill();
        g.upright = up; g.restore();
      };
      strip(x0, x1, r === len - 1 ? (pal.dark || pal.main) : ripple > 0.5 ? shadeHex(pal.main, 1.12) : ripple < -0.5 ? shadeHex(pal.main, 0.88) : pal.main);
      // The gold star, 2.5 rows down: a small cross with a centre.
      const sr = r - 1.5;
      if (Math.abs(sr) <= 1.5) {
        const half = Math.abs(sr) < 0.6 ? 1.5 : 0.5;
        strip(cx - half, cx - half + Math.max(1, Math.round(half * 2)), '#d0a426');
      }
    }
  });
}
const shadeCache = new Map();
function shadeHex(hex, k) {
  const key = hex + k; let v = shadeCache.get(key);
  if (!v) { const c = parseInt(hex.slice(1), 16), f = (s) => Math.min(255, Math.round(((c >> s) & 255) * k)); v = `rgb(${f(16)},${f(8)},${f(0)})`; shadeCache.set(key, v); }
  return v;
}

// A gun's recoil, 0 to 1 (shotAt, set in world.js fireWeapon): it kicks back at once, holds a
// moment, then eases home, slowing as it settles, within 0.3 s.
function recoil(e) {
  const k = G.t - (e.shotAt == null ? -9 : e.shotAt);
  if (k < 0 || k >= 0.3) return 0;
  return k < 0.04 ? 1 : (1 - (k - 0.04) / 0.26) ** 2;
}

// The SAM Site's launcher lives underground: the doors slide apart, then it rises (b.popK,
// set by updateSamPits in world.js: 0 = shut, 0.4 = doors open, 1 = up and ready).
function drawSamHead(g, b, x, y, stage) {
  const ease = (v) => v * v * (3 - 2 * v), k = b.popK || 0;
  const open = ease(Math.min(1, k / 0.4)), rise = ease(Math.max(0, (k - 0.4) / 0.6));
  const o = Math.round(open * 9);
  blit(g, sprite('SAMdoorL', () => samDoor(false), 0, 0, { shadow: false }), x + 15 - o, y + 4, false);
  blit(g, sprite('SAMdoorR', () => samDoor(true), 0, 0, { shadow: false }), x + 24 + o, y + 4, false);
  if (rise <= 0) return;
  const h = HEADS.sam, hz = -9 + (h[3] + 9) * rise, hx = x + h[1], hy = y + h[2] - hz * VK;
  const hs = headSprite('sam', b.faction, b.tface, stage);
  if (rise < 1) {   // the part still below ground is hidden by the pit's south lip
    g.save(); g.beginPath();
    g.rect(x + 16 - 10 * rise, y - 40, 16 + 20 * rise, 40 + 12 + 7 - 3 * VK);
    g.clip(); blit(g, hs, hx, hy, false); g.restore();
  } else blit(g, hs, hx, hy, false);
  if (b.fireT > 0) flash(g, hx + Math.cos(b.tface) * 14, hy + Math.sin(b.tface) * 14 - 2, 2);
}

function drawGhost(g, type, faction, cx, cy) {
  const s = structureSprite(type, faction);
  g.globalAlpha = 0.55;
  g.drawImage(s.img, Math.round(cx * CELL + s.ox), Math.round(cy * CELL + s.oy));
  g.globalAlpha = 1;
}

// Walls and gates (world.js placeWalls): one picture a piece, 24 px wide and 34 high (it stands up to 10 px above its
// cell), made for its kind, the sides it joins on (mask: 1 north, 2 east, 4 south, 8 west), its side's colour, whether
// it is battered and, for a gate, how far its barrier has sunk into the ground (0 shut to GATE_STEPS). Kept by key.
const wallPics = new Map();
const WALL_UP = 10, GATE_STEPS = 4;
function wallPic(id, mask, colour, hurt, open, gm) {
  const key = id + '|' + mask + '|' + colour + '|' + (hurt ? 1 : 0) + '|' + (open | 0) + '|' + (gm | 0);
  let c = wallPics.get(key);
  if (c) return c;
  c = mkCanvas(CELL, CELL + WALL_UP);
  const g = c.getContext('2d'), d = WALL_BY_ID[id], N = mask & 1, E = mask & 2, S = mask & 4, Wt = mask & 8;
  const r = rng(id * 977 + mask * 131 + 7);
  // A raised shape: its footprint (rectangles in cell pixels) drawn as a shadow, then its sides, then its top.
  const raise = (rects, h, top, side, edge) => {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (const [x, y, w, hh] of rects) g.fillRect(x + 2, y + WALL_UP + 1, w, hh);
    g.fillStyle = side;
    for (let k = 0; k < h; k++) for (const [x, y, w, hh] of rects) g.fillRect(x, y + WALL_UP - k, w, hh);
    g.fillStyle = top;
    for (const [x, y, w, hh] of rects) g.fillRect(x, y + WALL_UP - h, w, hh);
    if (edge) { g.fillStyle = edge; for (const [x, y, w] of rects) g.fillRect(x, y + WALL_UP - h, w, 1); }
  };
  // The run of a wall through its cell: a middle block and an arm to each side it joins.
  const run = (t) => {
    const a = (CELL - t) / 2, rects = [[a, a, t, t]];
    if (N) rects.push([a, 0, t, a]); if (S) rects.push([a, a + t, t, a]);
    if (Wt) rects.push([0, a, a, t]); if (E) rects.push([a + t, a, a, t]);
    if (!mask) rects[0] = [a - 2, a - 2, t + 4, t + 4];
    return rects;
  };
  if (d.gate) {
    // Two concrete pylons with a ribbed steel barrier between them that sinks into a slot in the ground (open: 0 shut
    // to GATE_STEPS fully down). Across the cell when the wall runs west-east (or stands alone), else down it.
    // A gate is three cells (gm: the sides this cell meets the rest of its gate on): pylons only at its two ends.
    const ns = gm ? !(gm & 10) : !(E || Wt) && (N || S), up = Math.round(8 * (1 - (open || 0) / GATE_STEPS));
    const jA = gm & (ns ? 1 : 8), jB = gm & (ns ? 4 : 2), x0 = jA ? 0 : 6, x1 = jB ? CELL : 18, bw = x1 - x0;
    const T = (x, y, w, h) => (ns ? [y, x, h, w] : [x, y, w, h]);          // laid out for west-east, turned for north-south
    const px = (col, x, y, w, h, z) => { const q = T(x, y, w, h); g.fillStyle = col; g.fillRect(q[0], q[1] + WALL_UP - (z || 0), q[2], q[3]); };
    const pylon = (x) => {
      raise([T(x, 5, 6, 14)], 9, '#b9bcb6', '#74777a', '#d6d9d3');
      raise([T(x + 1, 7, 4, 10)], 11, '#c9ccc6', '#8b8e90', '#e2e5df');     // the stepped cap
      const q = T(x + 1, 9, 4, 6); g.fillStyle = colour; g.fillRect(q[0], q[1] + WALL_UP - 11, q[2], q[3]);
      const l = T(x + 2, 11, 2, 2); g.fillStyle = open >= GATE_STEPS ? '#58e070' : '#ffb028'; g.fillRect(l[0], l[1] + WALL_UP - 11, l[2], l[3]);
    };
    const th = ns ? 8 : 6, b0 = 12 - th / 2;                                // a little thicker seen end on, so it reads
    const barrier = () => {
      px('#1d1f21', x0, b0 - 1, bw, th + 2);                                 // the slot it sinks into
      for (let k = x0; k < x1; k += 2) { px(k % 4 < 2 ? '#d8b024' : '#1c1c1a', k, b0 - 1, 2, 1); px(k % 4 < 2 ? '#1c1c1a' : '#d8b024', k, b0 + th, 2, 1); }
      if (up > 0) { g.fillStyle = 'rgba(0,0,0,0.28)'; const q = T(x0, b0, bw, th); g.fillRect(q[0] + 2, q[1] + WALL_UP + 1, q[2], q[3]); }
      for (let k = 0; k < up; k++) px('#6a7077', x0, b0, bw, th, k);         // its face, ribbed
      if (!ns) for (let k = x0 + 1; k < x1; k += 2) { g.fillStyle = '#474c52'; g.fillRect(k, b0 + th + WALL_UP - up + 1, 1, up); }
      px('#9ba1a7', x0, b0, bw, th, up);                                     // its top: steel with a hazard strip
      for (let k = x0; k < x1; k += 2) px(k % 4 < 2 ? '#e0b828' : '#26241c', k, 11, 2, 2, up);
      px('#c4cad0', x0, b0, bw, 1, up);
    };
    if (ns) { if (!jA) pylon(0); barrier(); if (!jB) pylon(18); } else { barrier(); if (!jA) pylon(0); if (!jB) pylon(18); }
  } else if (d.wire) {
    // Posts and three strands of coiled wire along the run.
    const ew = E || Wt || !(N || S), ns = N || S;
    const strand = (horiz) => {
      for (let k = 0; k < CELL; k++) {
        const wob = Math.round(Math.sin(k * 1.3) * 2), wob2 = Math.round(Math.cos(k * 1.1) * 2);
        const from = horiz ? (Wt || !E ? 0 : 12) : (N || !S ? 0 : 12), to = horiz ? (E || !Wt ? CELL : 12) : (S || !N ? CELL : 12);
        if (k < from || k >= to) continue;
        const px = horiz ? k : 12, py = horiz ? 12 : k;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px + (horiz ? 0 : wob) + 1, py + (horiz ? wob : 0) + WALL_UP + 1, 1, 1);
        g.fillStyle = '#b9bec4'; g.fillRect(px + (horiz ? 0 : wob), py + (horiz ? wob : 0) + WALL_UP - 3, 1, 1);
        g.fillStyle = '#7d848c'; g.fillRect(px + (horiz ? 0 : wob2), py + (horiz ? wob2 : 0) + WALL_UP - 1, 1, 1);
        if (k % 4 === 0) { g.fillStyle = '#e4e8ec'; g.fillRect(px + (horiz ? 0 : wob), py + (horiz ? wob : 0) + WALL_UP - 4, 1, 1); }   // barbs
      }
    };
    if (ew) strand(true);
    if (ns) strand(false);
    const post = (x, y) => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1, y + WALL_UP, 2, 2); g.fillStyle = '#5a4630'; g.fillRect(x, y + WALL_UP - 6, 2, 7); g.fillStyle = '#7a6244'; g.fillRect(x, y + WALL_UP - 6, 1, 7); };
    post(11, 11);
    if (ew && !E) post(21, 11); if (ew && !Wt) post(1, 11);
    if (ns && !S) post(11, 21); if (ns && !N) post(11, 1);
  } else if (d.key === 'sandbag') {
    // Bags laid like bricks: a wide course on the ground and a narrower one on top, half a bag along. Each bag is a
    // rounded sack with its own shade of burlap, a lit edge and a seam.
    const TOPS = ['#c6b580', '#b9a772', '#cfbf8c', '#bfad78'], SIDES = ['#8f7d4c', '#857344', '#978552', '#8a7848'];
    const bags = [];                                                       // [x, y, w, h, z, lift]
    const course = (horiz, a, b, t, z, lift, off, openA, openB) => {
      const cuts = [a];
      for (let k = off; k < b; k += 8) if (k > a + (openA ? 3 : 1) && k < b - (openB ? 3 : 1)) cuts.push(k);
      cuts.push(b);
      const o = (CELL - t) / 2;
      for (let i = 0; i + 1 < cuts.length; i++) { const p = cuts[i], w = cuts[i + 1] - p; bags.push(horiz ? [p, o, w, t, z, lift] : [o, p, t, w, z, lift]); }
    };
    const ew = E || Wt || !(N || S), nsr = N || S;
    if (ew) { const a = Wt ? 0 : (mask ? 5 : 2), b = E ? CELL : (mask ? 19 : 22); course(true, a, b, 14, 0, 3, 0, !Wt, !E); course(true, a + (Wt ? 0 : 2), b - (E ? 0 : 2), 8, 3, 3, 4, !Wt, !E); }
    if (nsr) { const a = N ? 0 : 5, b = S ? CELL : 19; course(false, a, b, 14, 0, 3, 0, !N, !S); course(false, a + (N ? 0 : 2), b - (S ? 0 : 2), 8, 3, 3, 4, !N, !S); }
    g.fillStyle = 'rgba(0,0,0,0.26)';
    for (const [x, y, w, h, z] of bags) if (!z) g.fillRect(x + 2, y + WALL_UP + 1, w, h);
    bags.sort((p, q) => p[4] - q[4] || (p[1] + p[3]) - (q[1] + q[3]) || p[0] - q[0]);
    for (const [x, y, w, h, z, lift] of bags) {
      const i = (r() * 4) | 0, ty = y + WALL_UP - z - lift, seam = 'rgba(52,42,20,0.8)', x1 = x + w - 1, yb = ty + h + lift - 1;
      g.fillStyle = SIDES[i]; g.fillRect(x, ty + h, w, lift);              // the face toward the camera, sagging darker at the foot
      g.fillStyle = 'rgba(40,32,14,0.4)'; g.fillRect(x, yb, w, 1);
      g.fillStyle = TOPS[i]; g.fillRect(x, ty, w, h);
      if (w > 4 && h > 4) { g.fillStyle = 'rgba(255,248,215,0.3)'; g.fillRect(x + 2, ty + 1, w - 4, h - 3); g.fillStyle = 'rgba(255,250,225,0.3)'; g.fillRect(x + 2, ty + 1, w - 5, 1); }   // the bulge of a full sack
      g.fillStyle = 'rgba(60,48,22,0.28)'; g.fillRect(x, ty + h - 1, w, 1); g.fillRect(x1, ty, 1, h);
      g.fillStyle = seam;                                                  // rounded corners, and the dark gap where bags meet
      g.fillRect(x, ty, 1, 1); g.fillRect(x1, ty, 1, 1); g.fillRect(x, yb, 1, 1); g.fillRect(x1, yb, 1, 1);
      g.fillStyle = 'rgba(52,42,20,0.45)';
      g.fillRect(x1, ty + h - 1, 1, lift + 1); g.fillRect(x, ty + h - 1, 1, lift + 1);
      if (r() < 0.35 && w > 5) { g.fillStyle = 'rgba(70,56,26,0.45)'; g.fillRect(x + 2 + ((r() * (w - 4)) | 0), ty + h, 1, lift - 1); }   // a crease
    }
  } else {
    const rects = run(10);
    raise(rects, 8, '#aeb1ac', '#6c6f72', '#cfd2cd');
    g.fillStyle = colour;                                                  // a line of the side's colour along the top
    for (const [x, y, w, hh] of rects) { if (w >= hh) g.fillRect(x, y + (hh >> 1) + WALL_UP - 8, w, 1); else g.fillRect(x + (w >> 1), y + WALL_UP - 8, 1, hh); }
  }
  if (hurt && !d.wire) {                                                   // battered: chips and cracks
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(20,18,14,0.6)';
    for (let k = 0; k < 14; k++) g.fillRect((r() * CELL) | 0, (r() * (CELL + WALL_UP)) | 0, 1 + (r() * 2 | 0), 1 + (r() * 2 | 0));
    g.globalCompositeOperation = 'source-over';
  }
  wallPics.set(key, c);
  return c;
}
// A sidebar picture for a kind of wall: three pieces of it in a row.
function wallCameo(kind, faction, key) {
  const W = 64, H = 48, c = mkCanvas(W, H), g = c.getContext('2d'), d = WALLS[kind];
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#26313b'); grd.addColorStop(0.5, '#46525c'); grd.addColorStop(0.52, '#4c5530'); grd.addColorStop(1, '#262c16');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  const col = palFor(faction).main, k = 1.25;
  const row = d.gate ? [[6, 2, 2], [4, 10, 10], [6, 8, 8]] : [[d.id, 2], [d.id, 10], [d.id, 8]];
  row.forEach(([id, mask, gm], i) => g.drawImage(wallPic(id, mask, col, false, 0, gm), Math.round((W - 3 * CELL * k) / 2 + i * CELL * k), Math.round((H - (CELL + WALL_UP) * k) / 2 + 2), CELL * k, (CELL + WALL_UP) * k));
  const url = c.toDataURL();
  cameoCache.set(key, url);
  return url;
}

// A destroyed bridge span (world.js addSpan), drawn over the ground while it is down (ui.js draw): open water where
// its cells were, with a ragged stub of the deck left at each end. Painted once per span with the map's own painter.
const spanRuins = new WeakMap();
function spanRuin(s) {
  let pic = spanRuins.get(s);
  if (pic) return pic;
  const M = 18;   // the painted bridge (rails, and its shadow up to 16 px to one side) reaches past its cells
  const X0 = s.cx * CELL - M, Y0 = s.cy * CELL - M, w = s.w * CELL + 2 * M, h = s.h * CELL + 2 * M, m = MAPS[validMap(G.mapId)];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const terr = G.terr.slice();
  for (const k of s.cells) terr[k] = 4;
  const painter = (bridges) => groundPainter(terr, groundSeed(G), G.road, bridges, G.cliff, G.ford, mapTheme(G.mapId), m.bridge, G.hgt, mesaTops(G.mapId));
  g.save();
  g.beginPath();
  for (const k of s.cells) g.rect(cellX(k) * CELL - X0 - M, cellY(k) * CELL - Y0 - M, CELL + 2 * M, CELL + 2 * M);
  g.clip();
  painter([]).paint(g, X0, Y0, w, h);
  const b = G.bridges[s.bi];
  if (b) {
    const full = document.createElement('canvas'); full.width = w; full.height = h;
    painter([b]).paint(full.getContext('2d'), X0, Y0, w, h);
    const len = Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y), ux = (b.b.x - b.a.x) / len, uy = (b.b.y - b.a.y) / len, hw = b.w / 2 + 3;
    const r = rng(s.id * 7919 + 13);
    const at = (t, v) => [b.a.x + ux * t - uy * v - X0, b.a.y + uy * t + ux * v - Y0];
    for (const end of [0, 1]) {
      const T = (t) => (end ? len - t : t);
      g.save();
      g.beginPath();
      g.moveTo(...at(T(-CELL), -hw)); g.lineTo(...at(T(-CELL), hw));
      for (let v = hw; v >= -hw; v -= 3) g.lineTo(...at(T(CELL * (0.55 + r() * 0.55)), v));
      g.closePath(); g.clip();
      g.drawImage(full, 0, 0);
      g.restore();
      // Broken edge: a dark line of rubble where the deck ends.
      g.fillStyle = 'rgba(20, 22, 26, 0.55)';
      for (let v = -hw + 3; v <= hw - 3; v += 2 + r() * 3) { const p = at(T(CELL * (0.6 + r() * 0.5)), v); g.fillRect(Math.round(p[0]), Math.round(p[1]), 2, 2); }
    }
  }
  // Debris: broken pieces of the deck lying in the shallows between the two ends, half under water.
  if (b) {
    const len = Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y), ux = (b.b.x - b.a.x) / len, uy = (b.b.y - b.a.y) / len, hw = b.w / 2 - 6;
    const r = rng(s.id * 104729 + 7), concrete = m.bridge === 'concrete', ang = Math.atan2(uy, ux);
    const top = concrete ? ['#8d9196', '#7c8085', '#9a9ea3'] : ['#6b5638', '#7a6342', '#5a4730'], side = concrete ? '#4c5055' : '#3a2c1c';
    const n = Math.max(6, Math.round(len * b.w / 2600));
    for (let i = 0; i < n; i++) {
      const t = CELL * 1.5 + r() * Math.max(1, len - CELL * 3), v = (r() * 2 - 1) * hw;
      const px = b.a.x + ux * t - uy * v - X0, py = b.a.y + uy * t + ux * v - Y0;
      const w2 = (i < 3 ? 10 : 4) + r() * (i < 3 ? 10 : 6), h2 = (i < 3 ? 6 : 3) + r() * (i < 3 ? 6 : 4), rot = ang + (r() - 0.5) * 1.6;
      g.save();
      g.translate(Math.round(px), Math.round(py)); g.rotate(rot);
      g.fillStyle = 'rgba(12, 24, 40, 0.45)'; g.fillRect(-w2 / 2 - 1, -h2 / 2 + 1, w2 + 3, h2 + 2);        // its shadow in the water
      g.fillStyle = side; g.fillRect(-w2 / 2, -h2 / 2, w2, h2 + 1);
      g.fillStyle = top[i % 3]; g.fillRect(-w2 / 2, -h2 / 2, w2, h2 - 1);
      g.fillStyle = 'rgba(40, 70, 105, 0.6)'; g.fillRect(-w2 / 2, h2 / 2 - 2 - r() * 2, w2 * (0.4 + r() * 0.6), 3);   // water lapping over one edge
      if (concrete && w2 > 9) { g.fillStyle = '#3a3d40'; g.fillRect(w2 / 2 - 1, -1, 4, 1); g.fillRect(w2 / 2 - 1, 1.5, 3, 1); }   // reinforcing bars
      g.restore();
      g.fillStyle = 'rgba(225, 235, 245, 0.55)';                                                               // foam round it
      for (let k = 0; k < 3; k++) g.fillRect(Math.round(px + (r() - 0.5) * (w2 + 6)), Math.round(py + (r() - 0.5) * (h2 + 6)), 1, 1);
    }
  }
  g.restore();
  pic = { c, x: X0, y: Y0 };
  spanRuins.set(s, pic);
  return pic;
}

function drawOre(g, cx, cy, amount, gem) {
  const lv = amount >= 190 ? 3 : amount >= 120 ? 2 : amount >= 60 ? 1 : 0;   // untouched fields (up to 375) look the same as full ones
  blit(g, (gem ? scenery.gem : scenery.ore)[lv][(cx * 7 + cy * 13) & 3], cx * CELL, cy * CELL);
}

// ---------------------------------------------------------------------------
// Effects: pre-rendered fireballs, smoke puffs and flames
// ---------------------------------------------------------------------------
const EXPL_FRAMES = 16;
const explCache = new Map();
function explFrames(size) {
  if (explCache.has(size)) return explCache.get(size);
  const r = rng(size * 31 + 7);
  const D = Math.ceil(size * 2.6) + 6;
  const NG = 4, GW = Math.ceil(D / NG) + 2, grid = new Float32Array(GW * GW);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const fine = new Float32Array(D * D);
  for (let i = 0; i < fine.length; i++) fine[i] = r();
  const noise = (x, y) => {
    const fx = x / NG, fy = y / NG, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const a = grid[y0 * GW + x0], b = grid[y0 * GW + x0 + 1], c = grid[(y0 + 1) * GW + x0], d = grid[(y0 + 1) * GW + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  const frames = [];
  for (let f = 0; f < EXPL_FRAMES; f++) {
    const prog = f / (EXPL_FRAMES - 1);
    const c = mkCanvas(D, D), g = c.getContext('2d'), img = g.createImageData(D, D), d = img.data;
    const R = size * (0.4 + 0.8 * Math.sqrt(prog)), cx = D / 2, cy = D / 2 + size * 0.15 - prog * size * 0.55;
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const n = noise(x + f * 0.6, y + f * 1.3) * 0.75 + fine[y * D + x] * 0.25;
      const dd = Math.hypot(x - cx, (y - cy) * 1.12) / R;
      const v = 1 - dd + (n - 0.5) * 0.7;
      if (v <= 0) continue;
      const heat = v * 1.7 - prog * 1.55;
      let col, a = 255;
      if (heat > 1.05) col = [255, 250, 214];
      else if (heat > 0.8) col = [255, 224, 112];
      else if (heat > 0.55) col = [255, 168, 48];
      else if (heat > 0.32) col = [236, 104, 32];
      else if (heat > 0.14) col = [176, 58, 22];
      else {
        const gr = 38 + n * 46 + (1 - dd) * 12;
        col = [gr, gr * 0.96, gr * 0.9];
        a = Math.min(255, v * 520) * (1 - prog * 0.85);
      }
      const o = (y * D + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a;
    }
    g.putImageData(img, 0, 0);
    frames.push(c);
  }
  explCache.set(size, frames);
  return frames;
}
const puffCache = [];
function puff(rad, light) {
  const key = rad * 2 + (light ? 1 : 0);
  if (puffCache[key]) return puffCache[key];
  const D = rad * 2 + 2, c = mkCanvas(D, D), g = c.getContext('2d'), img = g.createImageData(D, D), d = img.data, r = rng(rad * 13 + (light ? 5 : 0));
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const dx = x + 0.5 - D / 2, dy = y + 0.5 - D / 2, dd = Math.hypot(dx, dy) / rad;
    const v = 1 - dd + (r() - 0.5) * 0.35;
    if (v <= 0) continue;
    const lit = 1 + (-dx - dy) / (rad * 2.4);                // brighter toward the sun
    const base = light ? 196 : 74;
    const o = (y * D + x) * 4;
    d[o] = base * lit; d[o + 1] = base * lit * 0.97; d[o + 2] = base * lit * 0.92; d[o + 3] = Math.min(255, v * 400);
  }
  g.putImageData(img, 0, 0);
  puffCache[key] = c;
  return c;
}
const flameFrames = (() => {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const c = mkCanvas(7, 12), g = c.getContext('2d'), r = rng(f * 9 + 1);
    for (let y = 0; y < 12; y++) {
      const w = Math.max(0, Math.round((y / 12) * 3.5 + (r() - 0.5) * 2));
      for (let x = 3 - w; x <= 3 + w; x++) {
        const hot = 1 - Math.abs(x - 3) / (w + 1) + (y / 12) * 0.6;
        g.fillStyle = hot > 1.2 ? '#fff4b0' : hot > 0.95 ? '#ffd050' : hot > 0.7 ? '#ff9228' : '#d8461a';
        g.fillRect(x, y, 1, 1);
      }
    }
    out.push(c);
  }
  return out;
})();

const CRASH_LAST = new WeakMap();   // a falling aircraft's last tilted picture (kept off the effect: not saved or sent)
function drawEffect(g, fx) {
  drawVar = fx.v | 0;
  const k = fx.t / fx.life;
  switch (fx.type) {
    case 'expl': {
      const size = fx.size < 8 ? 7 : fx.size < 12 ? 11 : fx.size < 16 ? 15 : 22;
      const frames = explFrames(size), f = frames[Math.min(EXPL_FRAMES - 1, Math.floor(k * EXPL_FRAMES))];
      g.drawImage(f, Math.round(fx.x - f.width / 2), Math.round(fx.y - f.height / 2));
      if (fx.debris && k < 0.8) {
        const r = rng(fx.seed);
        g.fillStyle = '#2a2622';
        for (let i = 0; i < 10; i++) {
          const a = r() * Math.PI * 2, v = (0.5 + r()) * fx.size * 1.8;
          const [px, py] = liftPt(fx.x + Math.cos(a) * v * k, fx.y + Math.sin(a) * v * k * 0.7, Math.sin(k * Math.PI) * fx.size);   // out over the ground, up and down again
          g.fillRect(Math.round(px), Math.round(py), 2, 1);
        }
      }
      break;
    }
    case 'flakburst': {
      // A flash, then several overlapping black puffs spreading out and thinning.
      const r = rng(fx.seed);
      if (fx.t < 0.12) { g.fillStyle = 'rgba(255,190,90,0.85)'; g.beginPath(); g.arc(fx.x, fx.y, 3 + fx.t * 20, 0, 7); g.fill(); }
      g.globalAlpha = Math.max(0, 0.9 * (1 - k * k));
      for (let i = 0; i < 4; i++) {
        const ox = (r() - 0.5) * 8 * (0.5 + k), oy = (r() - 0.5) * 6 * (0.5 + k), rad = Math.max(2, Math.min(14, Math.round((2.5 + r() * 2) * (0.7 + k * 1.6))));
        const pc = puff(rad, false);
        g.drawImage(pc, Math.round(fx.x + ox - pc.width / 2), Math.round(fx.y + oy - pc.height / 2));
      }
      g.globalAlpha = 1;
      break;
    }
    case 'smoke': {
      const rad = Math.max(1, Math.min(14, Math.round(fx.r * (0.6 + k * 1.3))));
      const light = fx.color === '#c9c7c0' || fx.color === '#9a968c' || fx.color === '#8a7650';
      const pc = puff(rad, light);
      g.globalAlpha = Math.max(0, (fx.alpha || 0.55) * (1 - k));
      g.drawImage(pc, Math.round(fx.x - pc.width / 2), Math.round(fx.y - pc.height / 2));
      g.globalAlpha = 1;
      break;
    }
    case 'bolt': {   // a lightning bolt coming down on (fx.x, fx.y), forked, with a flash where it lands (world.js boltStrike)
      const a = k < 0.2 ? 1 : k < 0.3 ? 0.3 : k < 0.45 ? 0.9 : Math.max(0, 1 - (k - 0.45) / 0.55), r = rng(fx.seed | 0), pts = [[fx.x + (r() - 0.5) * 80, fx.y - 320]], forks = [];
      for (let i = 1; i <= 16; i++) {
        const [px] = pts[i - 1], ny = fx.y - 320 + 320 * i / 16, nx = i === 16 ? fx.x : px + (r() - 0.5) * 26 + (fx.x - px) * 0.18;
        pts.push([nx, ny]);
        if (i > 3 && i < 13 && r() < 0.3) { const f = [[nx, ny]], dir = r() < 0.5 ? -1 : 1; for (let j = 1; j < 5; j++) f.push([f[j - 1][0] + dir * (5 + r() * 10), f[j - 1][1] + 6 + r() * 9]); forks.push(f); }
      }
      g.lineJoin = 'round';
      for (const [wd, col] of [[6, `rgba(150,170,255,${0.25 * a})`], [2.5, `rgba(205,218,255,${0.65 * a})`], [1, `rgba(255,255,255,${a})`]]) {
        g.strokeStyle = col; g.lineWidth = wd;
        for (const line of [pts, ...forks]) { g.beginPath(); g.moveTo(line[0][0], line[0][1]); for (const p of line) g.lineTo(p[0], p[1]); g.stroke(); }
      }
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,250,220,${0.6 * a})`; g.beginPath(); g.arc(fx.x, fx.y, 9, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
      break;
    }
    case 'fire': {
      const f = flameFrames[(Math.floor(fx.t * 12 + (fx.x | 0)) % 4 + 4) % 4], sc = fx.s || 1;   // (x can be below 0 once lifted up the screen)
      g.globalAlpha = Math.min(1, (1 - k) * 3);
      if (sc > 1.3) {   // a big blaze lights up what is around it
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = `rgba(255,120,30,${0.12 * Math.min(1, (1 - k) * 3)})`;
        g.beginPath(); g.arc(...liftPt(fx.x, fx.y, 4 * sc), 6 * sc, 0, 7); g.fill();
        g.globalCompositeOperation = 'source-over';
      }
      // The flame's foot on its spot: placed by its middle (art.js uprightCtx), half its height up the screen.
      const w = sc === 1 ? f.width : Math.round(7 * sc * (1 - k * 0.4)), h = sc === 1 ? f.height : Math.round(12 * sc * (1 - k * 0.5)), foot = sc === 1 ? 11 - f.height : -1;
      const [cx, cy] = liftPt(fx.x, fx.y, h / 2 + foot);
      g.drawImage(f, cx - w / 2, cy - h / 2, w, h);
      g.globalAlpha = 1;
      break;
    }
    case 'tracer': {
      g.globalAlpha = 1 - k;
      g.strokeStyle = '#ffe48a'; g.lineWidth = 1;
      // Each end at its height (world.js: the gun's h0, the target's h2, folded into y), straight up the screen.
      const [ax, ay] = liftPt(fx.x, fx.y + (fx.h0 || 0), fx.h0 || 0), [bx, by] = liftPt(fx.x2, fx.y2 + (fx.h2 || 0), fx.h2 || 0);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.fillStyle = '#fffbe0'; g.fillRect(Math.round(bx - 1), Math.round(by - 1), 2, 2);
      g.globalAlpha = 1;
      break;
    }
    case 'spark': {
      g.fillStyle = k < 0.5 ? '#fff4c0' : '#ffaa40';
      g.fillRect(Math.round(fx.x - 1), Math.round(fx.y - 1), 2, 2);
      break;
    }
    case 'tesla': {
      const r = rng(fx.seed + Math.floor(fx.t * 30));
      const [x1, y1] = liftPt(fx.x, fx.y + (fx.h0 || 0), fx.h0 || 0), [x2, y2] = liftPt(fx.x2, fx.y2 + (fx.h2 || 0), fx.h2 || 0);
      g.globalAlpha = 1 - k * 0.6;
      for (let pass = 0; pass < 3; pass++) {
        g.strokeStyle = pass === 2 ? '#ffffff' : pass === 1 ? 'rgba(150,200,255,0.9)' : 'rgba(80,130,255,0.35)';
        g.lineWidth = pass === 2 ? 1 : pass === 1 ? 2 : 5;
        g.beginPath(); g.moveTo(x1, y1);
        const n = 9;
        for (let i = 1; i < n; i++) {
          const tt = i / n;
          g.lineTo(x1 + (x2 - x1) * tt + (r() - 0.5) * 11, y1 + (y2 - y1) * tt + (r() - 0.5) * 11);
        }
        g.lineTo(x2, y2); g.stroke();
      }
      g.globalAlpha = 1;
      break;
    }
    case 'corpse': {
      g.globalAlpha = Math.min(1, (1 - k) * 3);
      const pal = FACTIONS[fx.faction].pal;
      const x = Math.round(fx.x), y = Math.round(fx.y);
      g.fillStyle = 'rgba(90,20,14,0.7)'; g.fillRect(x - 3, y + 1, 5, 2);
      g.fillStyle = '#3a3d2c'; g.fillRect(x - 4, y - 1, 3, 2);
      g.fillStyle = pal.dark; g.fillRect(x - 1, y - 2, 4, 3);
      g.fillStyle = C.skin; g.fillRect(x + 3, y - 2, 2, 2);
      g.globalAlpha = 1;
      break;
    }
    case 'husk': drawHusk(g, fx); break;
    case 'ragdoll': {
      if ((fx.stagger && fx.stagger.t > 0) || fx.shock > 0) {
        // Still on his feet: staggering in flames, or jerking under a Tesla bolt.
        const fr = fx.shock > 0 ? (Math.random() < 0.5 ? 3 : 0) : 1 + (Math.floor(fx.t * 8) % 2);
        const jx = fx.shock > 0 ? (Math.random() - 0.5) * 2 : 0;
        blit(g, infSprite({ type: fx.unitType, faction: fx.faction, face: fx.face }, palFor(fx.faction), fr), fx.x + jx, fx.y);
        break;
      }
      const z = fx.P[8];
      if (fx.pool) drawPool(g, fx, Math.min(1, fx.pool.t / fx.pool.dur));
      else { g.fillStyle = `rgba(0,0,0,${0.3 / (1 + z / 20)})`; g.beginPath(); g.ellipse(fx.P[6], fx.P[7] + 1, 6, 2.5, 0, 0, 7); g.fill(); }
      drawRagBody(g, fx);
      break;
    }
    case 'turret': {
      const sh = 0.4 / (1 + fx.z / 25);
      g.fillStyle = `rgba(0,0,0,${sh})`; g.beginPath(); g.ellipse(fx.x, fx.y + 1, 7, 3, 0, 0, 7); g.fill();
      drawTurretAt(g, fx, fx.z);
      break;
    }
    case 'flare': {
      // A burning flare: a flickering white-hot core in an orange glow, trailing a smoke streak
      // that lingers and drifts after it.
      const a = Math.max(0, 1 - k), tr = fx.trail || [];
      for (let i = 1; i < tr.length; i++) {
        const q = i / tr.length;
        g.strokeStyle = `rgba(214,210,200,${0.5 * q * (0.4 + 0.6 * a)})`; g.lineWidth = 1 + (1 - q) * 1.5;
        g.beginPath(); g.moveTo(...liftPt(tr[i - 1].x, tr[i - 1].y, tr[i - 1].l || 0)); g.lineTo(...liftPt(tr[i].x, tr[i].y, tr[i].l || 0)); g.stroke();
      }
      if (a <= 0) break;
      const fl = 0.75 + Math.random() * 0.25;
      g.fillStyle = `rgba(255,150,40,${0.22 * a * fl})`; g.beginPath(); g.arc(fx.x, fx.y, 7, 0, 7); g.fill();
      g.fillStyle = `rgba(255,190,80,${0.45 * a * fl})`; g.beginPath(); g.arc(fx.x, fx.y, 4, 0, 7); g.fill();
      g.fillStyle = `rgba(255,252,235,${a})`; g.fillRect(Math.round(fx.x - 1.5), Math.round(fx.y - 1.5), 3, 3);
      break;
    }
    case 'crash': {
      // A downed aircraft falling at its real attitude (world.js updateCrash: pitch and roll): its model turned that way
      // (models.js tiltSprite), kept from the last frame while a new picture waits its turn. Without one (level, or none made
      // yet), the usual sprite, its roll squashing it across the line of flight and darker upside down.
      const fake = { def: fx.def, face: fx.face, faction: fx.faction }, pal = palFor(fx.faction);
      let s = tiltSprite(fake, pal, fx.pitch || 0, fx.roll || 0);
      const last = CRASH_LAST.get(fx);
      if (s === undefined) s = last && Math.abs(angDiff(last.face, fx.face)) < 0.6 ? last.s : null;
      if (s) CRASH_LAST.set(fx, { s, face: fx.face });
      const tilted = !!s, hgt = fx.alt / VK;
      if (!s) s = hullSprite(fake, pal);
      const zo = tilted ? (s.zoff || 0) * VK : 0;
      const sq = tilted ? 1 : Math.max(0.2, Math.abs(Math.cos(fx.roll || 0))), inv = !tilted && Math.cos(fx.roll || 0) < 0;
      const [shx, shy] = fromView((hgt - (tilted ? s.zoff || 0 : 0)) * SHADOW_DX, (hgt - (tilted ? s.zoff || 0 : 0)) * SHADOW_DY * VIEW.F), [bx, by] = liftPt(fx.x, fx.y, fx.alt - zo), [rx, ry] = liftPt(fx.x, fx.y, fx.alt + 9 * VK);
      const squash = (x, y) => { g.translate(x, y); g.rotate(fx.face); g.scale(1, sq); g.rotate(-fx.face); };
      if (s.sh) {
        g.save(); squash(fx.x + shx, fx.y + shy);
        g.globalAlpha = 0.3; g.drawImage(s.sh, Math.round(s.sox), Math.round(s.soy)); g.restore();
      }
      g.save(); squash(bx, by);
      if (inv) g.filter = 'brightness(0.55)';
      g.drawImage(s.img, Math.round(s.ox), Math.round(s.oy)); g.restore();
      if (!fx.jet && !fx.ground && fx.tip === undefined) {   // the rotor still turning, losing speed
        const ra = fx.t * 25;
        g.strokeStyle = 'rgba(28,28,24,0.75)'; g.lineWidth = 1.2; g.beginPath();
        for (let i = 0; i < 2; i++) { const a = ra + i * Math.PI / 2; g.moveTo(rx - Math.cos(a) * 13, ry - Math.sin(a) * 12); g.lineTo(rx + Math.cos(a) * 13, ry + Math.sin(a) * 12); }
        g.stroke();
      }
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,170,60,0.85)' : 'rgba(255,110,30,0.85)';
      g.beginPath(); g.arc(bx + (Math.random() - 0.5) * 6, by + (Math.random() - 0.5) * 4, 2.5 + Math.random() * 2, 0, 7); g.fill();
      if (fx.ground) {   // sparks off the belly as it scrapes along
        g.fillStyle = 'rgba(255,220,140,0.9)';
        for (let i = 0; i < 3; i++) g.fillRect(Math.round(fx.x - fx.vx * 0.04 * (1 + i) + (Math.random() - 0.5) * 8), Math.round(fx.y - fx.vy * 0.04 * (1 + i) + (Math.random() - 0.5) * 4), 1, 1);
      }
      break;
    }
    case 'eject': {
      // The seat and pilot riding the rocket up, flame beneath.
      const hgt = fx.alt / VK, [shx, shy] = fromView(hgt * SHADOW_DX, hgt * SHADOW_DY * VIEW.F), at = (h) => liftPt(fx.x, fx.y, fx.alt + h);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(fx.x + shx, fx.y + shy, 3, 2, 0, 0, 7); g.fill();
      if (fx.t < 0.3) {
        g.fillStyle = 'rgba(255,200,90,0.9)'; g.beginPath(); g.ellipse(...at(-6), 1.6, 3.5 + Math.random() * 2, 0, 0, 7); g.fill();
      }
      const [sx, sy] = at(-1.5);
      g.fillStyle = '#2b2b27'; g.fillRect(Math.round(sx - 2.5), Math.round(sy - 2.5), 5, 5);
      blit(g, infSprite({ type: 'pilot', faction: fx.faction, face: fx.face }, palFor(fx.faction), 4), ...at(-3), false);
      break;
    }
    case 'frag': {
      // A loose piece of wreckage: shadow below, the piece turning as it flies.
      const hgt = fx.alt / VK, fade = Math.min(1, (fx.life - fx.t) / 1.5);
      g.globalAlpha = fade;
      const [shx, shy] = fromView(hgt * SHADOW_DX, hgt * SHADOW_DY * VIEW.F);
      if (fx.alt > 0.5) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(Math.round(fx.x + shx - fx.w / 2), Math.round(fx.y + shy), Math.ceil(fx.w), 1); }
      g.save(); g.translate(...liftPt(fx.x, fx.y, fx.alt)); g.rotate(fx.rot); g.scale(1, 0.6 + 0.4 * Math.abs(Math.cos(fx.rot * 1.7)));
      g.fillStyle = fx.color; g.fillRect(-fx.w / 2, -fx.h / 2, fx.w, fx.h);
      if (fx.burning && fx.t < 3) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,170,60,0.9)' : 'rgba(255,110,30,0.9)'; g.fillRect(-1, -1, 2, 2); }
      g.restore(); g.globalAlpha = 1;
      break;
    }
    case 'wheel': {
      // A wheel torn off a vehicle (world.js updateWheel): its rim drawn as a disc turned in 3D (axle swung by hd, tipped by
      // lean), so it shows round when side-on and thin when edge-on; a lighter hub and one bolt that turns as it rolls.
      const fade = Math.min(1, (fx.life - fx.t) / 2), R = fx.r, hgt = fx.z / VK;
      g.globalAlpha = fade;
      const [shx, shy] = fromView(hgt * SHADOW_DX, hgt * SHADOW_DY * VIEW.F);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(fx.x + shx, fx.y + shy + 0.5, R * 0.9, R * 0.5, 0, 0, 7); g.fill();
      const ch = Math.cos(fx.hd), sh = Math.sin(fx.hd), cl = Math.cos(fx.lean), sl = Math.sin(fx.lean);
      const ax = -sh * cl, ay = ch * cl, az = sl;                       // the axle
      const ux = ch, uy = sh, vx = -az * uy, vy = az * ux, vz = ax * uy - ay * ux;   // two directions in the wheel's face
      const disc = (rr, col, rot) => {
        g.fillStyle = col; g.beginPath();
        for (let i = 0; i < 12; i++) {
          const q = i / 12 * Math.PI * 2 + (rot || 0), c = Math.cos(q) * rr, s2 = Math.sin(q) * rr;
          const [px, py] = liftPt(fx.x + ux * c + vx * s2, fx.y + uy * c + vy * s2, fx.z + vz * s2);
          if (i) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.fill();
      };
      const fl = fx.burn > 0 && Math.random() < 0.5;
      disc(R + 0.5, '#121210');                                       // dark outline, so it reads against the ground
      disc(R, fx.burn > 0 ? '#24221f' : '#3a3833');
      disc(R * 0.55, '#8a8a80');
      const c = Math.cos(fx.roll) * R * 0.3, s2 = Math.sin(fx.roll) * R * 0.3, [bx, by] = liftPt(fx.x + ux * c + vx * s2, fx.y + uy * c + vy * s2, fx.z + vz * s2);
      g.fillStyle = '#9a9a90'; g.fillRect(Math.round(bx), Math.round(by), 1, 1);
      if (fl) { const [fx2, fy2] = liftPt(fx.x, fx.y, fx.z + R); g.fillStyle = Math.random() < 0.5 ? 'rgba(255,170,60,0.85)' : 'rgba(255,110,30,0.85)'; g.fillRect(Math.round(fx2 - 1), Math.round(fy2 - 1), 2, 2); }
      g.globalAlpha = 1;
      break;
    }
    case 'ring': {
      g.globalAlpha = 1 - k;
      g.strokeStyle = fx.color; g.lineWidth = 1;
      const rr = 3 + k * 9;
      g.strokeRect(Math.round(fx.x - rr), Math.round(fx.y - rr * 0.7), Math.round(rr * 2), Math.round(rr * 1.4));
      g.globalAlpha = 1;
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Sidebar cameos: close-up renders of each unit and structure
// ---------------------------------------------------------------------------
const cameoCache = new Map();
// variant: 1 for a teammate's second colour (team.variant). It is set here, not left to whatever
// was drawn last, and is part of the cache key (before, a co-op player's sidebar mixed both colours).
// Transport rotors: [forward of the middle, hub height (voxels), radius (px), blades, turning way]; other helicopters have one.
const ROTORS = { chinook: [[14, 11.5, 15, 3, 1], [-17, 14.5, 15, 3, -1]], halo: [[1, 14.5, 21, 8, 1]] };
function cameoURL(type, faction, variant) {
  const v = variant | 0, key = type + faction + v;
  if (cameoCache.has(key)) return cameoCache.get(key);
  if (type.startsWith('wl:')) return wallCameo(type.slice(3), faction, key);
  if (type.startsWith('as:')) type = faction === 'allies' ? 'chinook' : 'halo';   // Air Assault: the side's transport (key kept apart)
  const keep = drawVar; drawVar = v;
  try { return makeCameo(type, faction, key); } finally { drawVar = keep; }
}
function makeCameo(type, faction, key) {
  const W = 64, H = 48, c = mkCanvas(W, H), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#26313b'); grd.addColorStop(0.5, '#46525c'); grd.addColorStop(0.52, '#4c5530'); grd.addColorStop(1, '#262c16');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const pal = palFor(faction);
  let mdl, angle = -0.55, scale;
  const power = type.startsWith('pw:') && type.slice(3);
  if (power) {
    mdl = power === 'spy' ? (faction === 'soviets' ? il76Model(pal, true) : sr71Model(pal)) : power === 'para' ? (faction === 'allies' ? c130Model(pal) : il76Model(pal)) : power === 'bomb' ? (faction === 'allies' ? b1Model(pal) : tu22Model(pal)) : power === 'cas' ? (faction === 'allies' ? a10Model(pal) : su25Model(pal)) : cargoModel(pal, power === 'bomb');
    scale = power === 'spy' ? (faction === 'soviets' ? 1.05 : 1.3) : power === 'cas' ? 1.4 : 1.05;
  } else if (BUILD_DEFS[type]) {
    mdl = STRUCTURES[type](pal, faction, true);
    angle = 0;
    const d = BUILD_DEFS[type], fw = d.w * CELL + 4, fh = d.h * CELL + mdl.d * VK;
    scale = Math.min(1.3, (W - 2) / fw, (H - 2) / fh);
  } else {
    const d = UNIT_DEFS[type];
    if (d.cls === 'inf') mdl = infModel(pal, faction, type, d.setup ? 5 : 0);   // the MG Team shown set up
    else if (d.draw === 'tank') mdl = tankHull(pal, d.size);
    else if (d.draw === 'jeep') mdl = jeepModel(pal);
    else if (d.draw === 'apc') mdl = type === 'btr' ? btrHull(pal) : apcHull(pal);
    else if (d.draw === 'harv') mdl = harvModel(pal, true);
    else if (d.draw === 'fob') mdl = fobModel(pal);
    else if (d.draw === 'mcv') mdl = mcvModel(pal);
    else if (d.draw === 'arty') mdl = artyModel(pal);
    else if (d.draw === 'v2') mdl = v2Model(pal, true, 1);   // shown raised
    else if (d.fly === 'heli') mdl = type === 'hind' ? hindModel(pal) : type === 'comanche' ? comancheModel(pal, 1) : type === 'chinook' ? chinookModel(pal) : type === 'halo' ? haloModel(pal) : heliModel(pal);   // (the Comanche with its bays open)
    else mdl = jetModel(pal, type === 'mig');
    scale = d.setup && d.cls === 'inf' ? 2 : d.cls === 'inf' ? 3.2 : d.fly === 'jet' ? 1.75 : d.lift ? 1.3 : d.fly ? 1.7 : d.size && d.size.len > 22 ? 1.9 : 2.3;
  }
  const s = renderVox(mdl, angle, { scale, shadow: false });
  const dx = Math.round((W - s.img.width) / 2), dy = Math.round((H - s.img.height) / 2 + (BUILD_DEFS[type] ? 0 : 3) - (power ? 6 : 0));
  g.drawImage(s.img, dx, dy);
  if (power === 'para') {
    for (const [x, y] of [[14, 36], [30, 40], [46, 35]]) {
      g.fillStyle = '#e4ddc6'; g.beginPath(); g.ellipse(x, y - 5, 6, 4, 0, Math.PI, 0); g.fill();
      g.strokeStyle = '#3a352c'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x, y + 1); g.lineTo(x + 5, y - 5); g.stroke();
      g.fillStyle = '#2c3020'; g.fillRect(x - 1, y, 2, 4);
    }
  } else if (power === 'bomb') {
    g.fillStyle = '#1d1f18';
    for (const [x, y] of [[22, 34], [30, 39], [38, 44]]) { g.fillRect(x - 1, y - 3, 3, 6); g.fillStyle = '#5a5c4c'; g.fillRect(x - 1, y - 3, 1, 3); g.fillStyle = '#1d1f18'; }
  } else if (power === 'spy') {
    g.strokeStyle = 'rgba(160,230,140,0.7)'; g.lineWidth = 1;
    g.beginPath(); g.arc(W / 2, H / 2 + 8, 12, 0.2, Math.PI - 0.2); g.stroke();
  }
  // Tanks get their turret in the cameo too.
  const d = !power && UNIT_DEFS[type];
  if (d && (d.draw === 'tank' || d.draw === 'jeep' || d.draw === 'apc')) {
    const tm = d.draw === 'tank' ? tankTurret(pal, d.size) : d.draw === 'apc' ? (type === 'btr' ? btrTurret(pal, 0) : apcTurret(pal, 0)) : mgModel(pal);
    const ts = renderVox(tm, angle, { scale, shadow: false });
    const z = turretZ(d) * VK * scale, off = (d.draw === 'jeep' ? -3 : d.draw === 'apc' ? 0 : -1) * scale;
    const ox = dx - s.ox * scale, oy = dy - s.oy * scale;
    g.drawImage(ts.img, Math.round(ox + Math.cos(angle) * off + ts.ox * scale), Math.round(oy + Math.sin(angle) * off - z + ts.oy * scale));
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeRect(0.5, 0.5, W - 1, H - 1);
  const url = c.toDataURL();
  cameoCache.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------
// Walls and gates in the iso view: each piece is built from boxes (a post in the middle of its cell and an arm toward each
// joined neighbour) drawn as solid prisms, back to front, with only the faces turned to the camera. ui.js sorts each cell
// in with the units (kind 'wall') and calls drawWallIso on the view canvas.
const WALL_LOOK = {
  1: { h: 6.5, a: 4, top: '#c2ae80', side: '#86754d', seam: '#5e5034' },      // sandbags: two courses of sacks
  3: { h: 13, a: 5, top: '#a7a7a0', side: '#85857e', seam: '#686862' },     // concrete
};
const WALL_DIAG = [[1, -1, 16], [1, 1, 32], [-1, 1, 64], [-1, -1, 128]];   // diagonal joins (ui.js sets them in the mask)
// Sandbags and concrete walls (not gates, which open and close, nor wire) are drawn once per look into a small picture and that is drawn after: zoomed out
// over a big battle, making every wall's faces and edges again each frame was several ms (owner's PC, 2026-11-22). A look:
// the type, the sides it joins, damaged or not, the owner's colour (concrete), the sacks' shades (sandbags: by cell, 5
// patterns), and the view's turn and squash (the transform's linear part).
const wallIsoPics = new Map();
function drawWallIso(g, e) {
  if (e.id !== 1 && e.id !== 3 || typeof document === 'undefined') { drawWallIsoLive(g, e); return; }   // (barbed wire's thin coils stay live: in a picture they came out faint)
  const tf = g.getTransform(), mx = e.cx * CELL + CELL / 2, my = e.cy * CELL + CELL / 2;
  const key = e.id + '|' + e.mask + '|' + (e.hurt ? 1 : 0) + '|' + (e.id === 1 ? e.c % 5 : '') + '|' + (e.id === 3 ? e.col : '') + '|'
    + tf.a.toFixed(3) + ',' + tf.b.toFixed(3) + ',' + tf.c.toFixed(3) + ',' + tf.d.toFixed(3);
  let P = wallIsoPics.get(key);
  if (!P) {
    // Its box on the screen: the cell's corners from the ground to above the tallest wall.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (const h of [0, 26 * VK]) {
      const [wx, wy] = liftPt(mx + x * CELL * 0.75, my + y * CELL * 0.75, h), X = tf.a * (wx - mx) + tf.c * (wy - my), Y = tf.b * (wx - mx) + tf.d * (wy - my);   // (from the cell's middle)
      x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
    }
    const ox = Math.ceil(-x0) + 2, oy = Math.ceil(-y0) + 2, c = mkCanvas(Math.ceil(x1 - x0) + 5, Math.ceil(y1 - y0) + 5), cg = c.getContext('2d');
    cg.setTransform(tf.a, tf.b, tf.c, tf.d, ox - (tf.a * mx + tf.c * my), oy - (tf.b * mx + tf.d * my));   // (mx, my) at (ox, oy)
    drawWallIsoLive(cg, e);
    if (wallIsoPics.size > 3000) wallIsoPics.clear();
    wallIsoPics.set(key, P = { c, ox, oy });
  }
  const X = tf.a * mx + tf.c * my + tf.e, Y = tf.b * mx + tf.d * my + tf.f;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const up = g.upright; g.upright = false;
  g.drawImage(P.c, Math.round(X - P.ox), Math.round(Y - P.oy));
  g.upright = up; g.restore();
}
function drawWallIsoLive(g, e) {
  const tf = g.getTransform();
  const S = (x, y, h) => { const [wx, wy] = liftPt(x, y, h); return [tf.a * wx + tf.c * wy + tf.e, tf.b * wx + tf.d * wy + tf.f]; };
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`; };
  const poly = (pts, fill, stroke) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); } };
  // A box from (x0, y0) to (x1, y1) on the ground, from height z0 to z1; colours as #rrggbb, k darkens (a battered piece).
  // A solid prism over a convex outline of ground points (any order round it), from height z0 to z1.
  const prism = (pts, z0, z1, top, side, edge, k = 1) => {
    edge = edge && shade(edge, k);
    const ox = pts.reduce((a, p) => a + p[0], 0) / pts.length, oy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      let nx = b[1] - a[1], ny = a[0] - b[0];
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (nx * ((a[0] + b[0]) / 2 - ox) + ny * ((a[1] + b[1]) / 2 - oy) < 0) { nx = -nx; ny = -ny; }   // outward
      if (nx * VIEW.s + ny * VIEW.c <= 0.01) continue;   // only the faces turned to the camera
      poly([S(a[0], a[1], z0), S(b[0], b[1], z0), S(b[0], b[1], z1), S(a[0], a[1], z1)], shade(side, k * (nx - ny > 0.01 ? 0.92 : 0.78)), edge);
    }
    poly(pts.map((p) => S(p[0], p[1], z1)), shade(top, k), edge);
  };
  const box = (x0, y0, x1, y1, z0, z1, top, side, edge, k) => prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, top, side, edge, k);
  const bx = e.cx * CELL, by = e.cy * CELL, mx = bx + CELL / 2, my = by + CELL / 2, m = e.mask;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const up = g.upright; g.upright = false;
  // Parts: the middle and an arm to each joined side, drawn furthest first.
  // A diagonal piece (joined only at its corners) has a post turned to lie along the wall and an arm to each joined corner,
  // so a run of them is one straight wall in the iso view. Diagonal outlines are given as point lists.
  const diag = m & 240, h2 = Math.SQRT1_2;
  const parts = (a, ins = 0) => {
    const out = [];
    if (diag) out.push([[mx + a * Math.SQRT2, my], [mx, my + a * Math.SQRT2], [mx - a * Math.SQRT2, my], [mx, my - a * Math.SQRT2]]);
    else out.push([mx - a, my - a, mx + a, my + a]);
    const s0 = diag ? 0 : a;   // orthogonal arms start at the post's edge (or its middle beside a turned post)
    if (m & 1) out.push([mx - a, by + ins, mx + a, my - s0]);
    if (m & 8) out.push([bx + ins, my - a, mx - s0, my + a]);
    if (m & 2) out.push([mx + s0, my - a, bx + CELL - ins, my + a]);
    if (m & 4) out.push([mx - a, my + s0, mx + a, by + CELL - ins]);
    for (const [dx, dy, bit] of WALL_DIAG) if (m & bit) {
      const ex = mx + dx * (CELL / 2 - ins * h2), ey = my + dy * (CELL / 2 - ins * h2), px = -dy * h2 * a, py = dx * h2 * a;
      out.push([[mx + px, my + py], [ex + px, ey + py], [ex - px, ey - py], [mx - px, my - py]]);
    }
    return out;
  };
  const midOf = (p) => (typeof p[0] === 'number' ? [(p[0] + p[2]) / 2, (p[1] + p[3]) / 2] : [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]);
  const byDepth = (list, key = (x) => x) => list.sort((p, q) => viewDepth(...midOf(key(p))) - viewDepth(...midOf(key(q))));   // furthest first
  const piece = (p, z0, z1, k) => (typeof p[0] === 'number' ? box(p[0], p[1], p[2], p[3], z0, z1, L.top, L.side, L.seam, k) : prism(p, z0, z1, L.top, L.side, L.seam, k));
  const L = WALL_LOOK[e.id];
  if (L) {
    const k = e.hurt ? 0.78 : 1;
    if (e.id === 1) {   // sandbags: a lower and an upper course, the upper a little narrower
      const hi = parts(L.a - 0.7, 0.7);
      const tone = (i, j) => k * (0.9 + 0.1 * (((e.c * 7 + i * 13 + j * 5) % 5) / 4));   // each sack a shade apart, fixed per cell
      for (const [p, i] of byDepth(parts(L.a).map((p, i) => [p, i]), (x) => x[0])) {
        piece(p, 0, L.h / 2, tone(i, 0));
        piece(typeof p[0] === 'number' ? [p[0] + 0.7, p[1] + 0.7, p[2] - 0.7, p[3] - 0.7] : hi[i], L.h / 2, L.h, tone(i, 1));
      }
    } else for (const p of byDepth(parts(L.a))) piece(p, 0, L.h, k);
    if (e.id === 3) {   // the owner's colour along the top
      g.strokeStyle = e.col; g.lineWidth = 1.5; g.beginPath();
      const a = S(mx, my, L.h);
      for (const [dx, dy, bit] of [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8], ...WALL_DIAG]) if (m & bit) { const b = S(mx + dx * CELL / 2, my + dy * CELL / 2, L.h); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
      if (!m) { const b = S(mx + 2, my + 2, L.h); g.moveTo(a[0] - 2, a[1]); g.lineTo(b[0], b[1]); }
      g.stroke();
    }
  } else if (e.id === 2) {   // barbed wire: posts and loose coils along each arm
    const ends = [[mx, my]];
    for (const [dx, dy, bit] of [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8], ...WALL_DIAG]) if (m & bit) ends.push([mx + dx * CELL / 2, my + dy * CELL / 2]);
    if (ends.length === 1) ends.push([mx - 8, my], [mx + 8, my]);
    g.strokeStyle = e.hurt ? 'rgba(110,106,98,0.8)' : 'rgba(170,166,154,0.85)'; g.lineWidth = 0.7;
    for (let i = 1; i < ends.length; i++) {
      const [x0, y0] = ends[0], [x1, y1] = ends[i];
      for (let j = 0; j <= 4; j++) {
        const t = j / 4, [cx, cy] = S(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 4);
        g.beginPath(); g.ellipse(cx + (j % 2 ? 0.8 : -0.8), cy, 3.4, 3.8, 0.3, 0, 7); g.stroke();
      }
    }
    for (const [x, y] of ends) box(x - 0.8, y - 0.8, x + 0.8, y + 0.8, 0, 9, '#4a4036', '#3a3328');
  } else {   // a gate: concrete pylons at its ends, a ribbed steel barrier between them that sinks into the ground to open
    // Along the gate: d (unit, from its first cell to its last), across: n. A diagonal gate's cells are CELL x sqrt 2 long
    // along it (corner to corner), so it runs straight on into a diagonal wall.
    const cs = gateCells(e.c), one = cs.length === 1, A = cs[0], B = cs[cs.length - 1];
    const sx = one ? (e.id === 5 ? 0 : 1) : Math.sign(cellX(B) - cellX(A)), sy = one ? (e.id === 5 ? 1 : 0) : Math.sign(cellY(B) - cellY(A));
    const dl = Math.hypot(sx, sy), dx = sx / dl, dy = sy / dl;
    const half = (dx && dy ? CELL * Math.SQRT2 : CELL) / 2;
    const end = e.id === 6 || one, rise = 2 + 9 * (1 - e.open / GATE_STEPS);
    // The outline from s0 to s1 along the gate (0 = this cell's middle), a either side of the line.
    const alongD = (dx, dy, s0, s1, a) => [[mx + dx * s0 - dy * a, my + dy * s0 + dx * a], [mx + dx * s1 - dy * a, my + dy * s1 + dx * a],
      [mx + dx * s1 + dy * a, my + dy * s1 - dx * a], [mx + dx * s0 + dy * a, my + dy * s0 - dx * a]];
    const along = (s0, s1, a) => alongD(dx, dy, s0, s1, a);
    // The barrier runs over the middle and halfway into each end, toward the middle.
    const first = A === e.c, last = B === e.c;
    const s0 = one ? 4 - half : first ? 0 : -half, s1 = one ? half - 4 : last ? 0 : half;
    const barrier = () => prism(along(s0, s1, 1.6), 0, rise, '#c9b23a', '#7c7d78', '#4a4b47');
    const pylons = one ? [2 - half, half - 2] : end ? [0] : [];
    const midP = (p) => [p.reduce((t, q) => t + q[0], 0) / 4, p.reduce((t, q) => t + q[1], 0) / 4];
    const pyl = pylons.map((u) => along(u - 4, u + 4, 4));
    // An end with wall next to it (any of its eight neighbours but the gate's own cells, a corner neighbour only when the two
    // cells between are open, as ui.js joins it): a stub of that wall from the pylon out to the cell's edge or corner, so the
    // wall runs into it, whichever way it comes (a gate on a bend in a wall).
    const stubs = [];
    if (!one && end) for (const [ox, oy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]) {
      const nx = e.cx + ox, ny = e.cy + oy;
      if (!inMap(nx, ny) || cs.includes(idx(nx, ny))) continue;
      if (ox && oy && (G.wall[idx(nx, e.cy)] || G.wall[idx(e.cx, ny)])) continue;
      const wid = G.wall[idx(nx, ny)], SL = WALL_LOOK[wid];
      if (!SL) continue;
      const l = Math.hypot(ox, oy), ux = ox / l, uy = oy / l, reach = (CELL / 2) * l;
      stubs.push([alongD(ux, uy, 3, reach, SL.a), SL, [ux, uy, 3, reach], wid]);
    }
    const items = [...pyl.map((p) => ['p', p]), ...stubs.map((t) => ['s', ...t]), ['b']].sort((a, b) => (a[0] === 'b' ? viewDepth(mx, my) : viewDepth(...midP(a[1])))
      - (b[0] === 'b' ? viewDepth(mx, my) : viewDepth(...midP(b[1]))));
    for (const [kind, p, SL, span, wid] of items) {
      if (kind === 'b') { if (s1 > s0) barrier(); continue; }
      if (kind === 's') {
        prism(p, 0, SL.h, SL.top, SL.side, SL.seam, e.hurt ? 0.78 : 1);
        if (wid === 3) {   // concrete: the owner's colour along the top, as on the wall
          const [ux, uy, r0, r1] = span, a = S(mx + ux * r0, my + uy * r0, SL.h), b = S(mx + ux * r1, my + uy * r1, SL.h);
          g.strokeStyle = e.col; g.lineWidth = 1.5; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        }
        continue;
      }
      prism(p, 0, 17, '#a9a9a2', '#8a8a84', '#5c5c57', e.hurt ? 0.8 : 1);
      const [lx, ly] = S(...midP(p), 17);
      g.fillStyle = e.open > 0 ? '#5ee060' : '#f0a020'; g.fillRect(Math.round(lx - 1.5), Math.round(ly - 1.5), 3, 3);   // its lamp
      g.fillStyle = e.col; g.fillRect(Math.round(lx - 3), Math.round(ly + 3), 6, 2);   // the owner's colour
    }
  }
  g.upright = up; g.restore();
}
