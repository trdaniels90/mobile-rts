'use strict';
// Terrain painting, sprite drawing, effects and sidebar cameos. Units, structures and scenery
// come from the voxel models in models.js; this file puts them on screen.

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Draws a pre-rendered sprite (and its cast shadow) with its origin at world (x, y).
function blit(g, s, x, y, shadow) {
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
function groundPixels(terr, seed, roads, cliffs, fords, theme) {
  const snow = theme === 'snow';
  // A 256-colour era look: a handful of tones per surface, picked with dithered noise.
  // Winter: snow in cold blue shades, the tracks trodden to grey slush, frosted stony shores, dark icy water.
  const GRASS = snow ? [[156, 166, 184], [178, 188, 204], [198, 207, 220], [216, 223, 233], [234, 239, 246]] : [[30, 40, 24], [38, 50, 29], [46, 60, 34], [56, 70, 40], [70, 84, 48]];
  const EARTH = snow ? [[98, 94, 92], [116, 112, 108], [134, 130, 126], [152, 150, 148]] : [[66, 55, 39], [80, 67, 47], [96, 81, 57], [112, 95, 67]];
  const SANDS = snow ? [[142, 148, 158], [162, 168, 178], [182, 189, 199]] : [[124, 111, 82], [140, 126, 94], [156, 142, 108]];
  const WATER = snow ? [[30, 48, 68], [38, 58, 80], [48, 70, 94], [60, 84, 108]] : [[52, 80, 108], [62, 92, 122], [74, 106, 138], [90, 122, 154]];
  const STROKE = snow ? 0.5 : 0.95;   // snow shows the blade tile only as soft wind ripples
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
  // Paints world pixels (X0, Y0, w x h) into d, RGBA w x h.
  function pixels(d, X0, Y0, w, h) {
    if (!P) prepare();
    const { dirt, water, ford, nearFlag, N1, N2, N3, tile } = P, TM = GRASS_TILE_N - 1;
    let p = 0;
    for (let y = Y0; y < Y0 + h; y++) {
      const fy = y / CELL - 0.5;
      for (let x = X0; x < X0 + w; x++, p += 4) {
        const fx = x / CELL - 0.5;
        const n3 = noise(N3, x, y), hh = noise(N1, x, y) * 0.35 + noise(N2, x, y) * 0.45 + n3 * 0.2;
        const sp = speck(x, y);
        // Grass: the Blender blade tile gives the strokes. Two lookups (the second turned on its side and shifted)
        // are mixed by slow noise, so the 128-pixel repeat does not show.
        const tA = tile[(y & TM) * GRASS_TILE_N + (x & TM)], tB = tile[((x + 53) & TM) * GRASS_TILE_N + ((y + 29) & TM)];
        const ms = Math.max(0, Math.min(1, (n3 - 0.4) / 0.2)), gt = (tA + (tB - tA) * ms) / 9;
        let col = pickTone(GRASS, hh * 1.1 - 0.12 + (gt - 0.5) * STROKE + (sp - 0.5) * 0.1);
        if (sp > 0.992) col = GRASS[4];
        const near = nearFlag[Math.min(MAP - 1, Math.max(0, Math.round(fy))) * MAP + Math.min(MAP - 1, Math.max(0, Math.round(fx)))];
        const dv = near & 1 ? bil(dirt, fx, fy) + (hh - 0.5) * 0.3 + (sp - 0.5) * 0.12 : 0;
        if (dv > 0.42) col = pickTone(EARTH, hh * 1.2 - 0.1 + (sp - 0.5) * 0.6);
        const wv = near & 2 ? bil(water, fx, fy) + (hh - 0.5) * 0.22 : 0;
        if (wv > 0.5) {
          const crest = ((x * 3 + y * 7 + Math.floor(noise(N1, (x * 3) % WORLD, y) * 30)) % 23 === 0) && sp > 0.4;
          col = crest ? (snow ? [70, 94, 118] : [150, 172, 190]) : pickTone(WATER, 0.9 - (wv - 0.5) * 1.6 + (hh - 0.5) * 0.5 + (sp - 0.5) * 0.4);
          if (wv < 0.545) col = sp > 0.35 ? [178, 192, 198] : [120, 140, 156];   // surf
          if (snow && wv < 0.6 + (hh - 0.5) * 0.25) col = sp > 0.25 ? [206, 222, 234] : [168, 190, 208];   // shelf ice along the shore
          const fv = near & 4 ? bil(ford, fx, fy) + (noise(N1, x, y) - 0.5) * 1.6 + (noise(N2, x, y) - 0.5) * 1.0 : 0;   // a ragged edge
          if (fv > 0.3) {   // the ford: a bed of rounded stones and sand under shallow water, with ripples
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
              if (((x * 2 + Math.floor(noise(N1, x, (y * 4) % WORLD) * 24)) % 13 === 0) && sp > 0.25) sh = [176, 196, 204];   // white water between the stones
            }
            col = [col[0] + (sh[0] - col[0]) * k, col[1] + (sh[1] - col[1]) * k, col[2] + (sh[2] - col[2]) * k];
          }
        } else if (wv > 0.36) {
          col = pickTone(SANDS, (wv - 0.36) * 4 + (sp - 0.5) * 0.7);
          if (sp > 0.93) col = snow ? [96, 98, 104] : [92, 86, 74];            // pebbles
        }
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
      }
    }
    if (P.cliff) paintCliffs(d, P.cliff, seed, snow, X0, Y0, w, h);
    if (roads && roads.length) paintRuts(d, roads, X0, Y0, w, h);
  }
  return { pixels };
}
// Baked sprites (tools/bake-sprites.js; here, not in models.js, whose text the bake's --check hashes): sheets of finished pictures in sprites/, loaded in the background and cut
// into the sprite cache, so the game does not render voxel models while you play. need(['allies0', ...]) loads those
// sheets (faction and team colour 0-2, or 'burnt'); a sprite not loaded yet, or not baked, is rendered as before. Only
// over http(s) and in the Windows app (a page opened from a file cannot read pictures back, which tests rely on).
const SpriteSheets = (() => {
  let man = null, manP = null;
  const loaded = new Set();
  const ok = () => typeof location !== 'undefined' && /^(https?|app):$/.test(location.protocol) && typeof createImageBitmap === 'function' && typeof fetch === 'function'
    && !(typeof HEADLESS !== 'undefined' && HEADLESS);
  const manifest = () => manP || (manP = fetch('sprites/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => (man = m)).catch(() => null));
  async function load(name) {
    const m = await manifest();
    const sh = m && m.sheets.find((x) => x.file.split('.')[0] === name);
    if (!sh) return;
    const r = await fetch('sprites/' + sh.file);
    if (!r.ok) return;
    const bmp = await createImageBitmap(await r.blob());
    const cut = (x, y, w, h) => createImageBitmap(bmp, x, y, w, h);
    for (let i = 0; i < sh.sprites.length; i += 64) {   // a few at a time, so loading never holds up a frame
      await Promise.all(sh.sprites.slice(i, i + 64).map(async (e) => {
        if (spriteCache2.has(e[0])) return;
        const s = { img: await cut(e[1], e[2], e[3], e[4]), ox: e[5], oy: e[6] };
        if (e.length > 7) { s.sh = await cut(e[7], e[8], e[9], e[10]); s.sox = e[11]; s.soy = e[12]; }
        if (spriteCache2.has(e[0])) return;
        spriteCache2.set(e[0], s);
        const mk = e[0].slice(0, e[0].lastIndexOf('|'));
        if (!spriteAny.has(mk)) spriteAny.set(mk, s);
      }));
    }
    if (bmp.close) bmp.close();
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
  return { need, ready: () => pending === 0, loaded: () => [...loaded], get manifest() { return man; } };
})();
SpriteSheets.need(['allies0', 'soviets0', 'burnt']);   // the main colours, in the background from the start

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
  if (ok()) fetch('grounds/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => { man = m; }).catch(() => {});
  return { get manifest() { return man; }, ok };
})();
// Fixed maps paint the same ground every game (so it can be baked); generated maps vary it with the battle's seed.
function groundSeed(g) { return MAPS[validMap(g.mapId)].rows ? 0x2b1d5eed : g.seed; }
// A hash of everything the ground of battle g is painted from (the baked pictures are only used when it matches).
function groundKey(g) {
  let h = 0x811c9dc5 | 0;
  const num = (v) => { h = Math.imul(h ^ (v | 0), 16777619); };
  const str = (t) => { for (let i = 0; i < t.length; i++) num(t.charCodeAt(i)); };
  str(JSON.stringify([validMap(g.mapId), MAP, CELL, GROUND_TILE, GROUND_SHEET, groundSeed(g), mapTheme(g.mapId), MAPS[validMap(g.mapId)].bridge || '', g.bridges || []]));
  for (const a of [g.terr, g.road, g.cliff, g.ford]) { num(a ? a.length : -1); if (a) for (let i = 0; i < a.length; i++) num(a[i]); }
  return (h >>> 0).toString(16);
}

// The ground painter for one map: paint(g, x0, y0, w, h, ox, oy) paints that part of the ground (world pixels) into
// g at (ox, oy): the pixels (groundPixels), then bridges and scenery on top (decorate). Every pixel depends only on
// where it is, so parts painted one by one fit together exactly (the ground tiles, makeGround). The scenery and
// bridges are prepared once, at the first paint. args: groundPixels' arguments (for the workers).
// bridgeKind: 'concrete', or timber when not given (`bridge` in MAPS).
function groundPainter(terr, seed, roads, bridges, cliffs, fords, theme, bridgeKind) {
  const snow = theme === 'snow', px = groundPixels(terr, seed, roads, cliffs, fords, theme);
  let P = null;   // scenery stamps and bridge pictures
  function prepare() {
    buildScenery();
    // Scenery stamps, back to front, each with the box it covers (shadow included).
    const rs = rng(seed ^ 0x2c1b3c6d), stamps = [];
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
            sprite(set[Math.floor(rs() * set.length)], x0 + 4 + rs() * 16, y0 + 6 + rs() * 14);
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
    // Bridges over the lakes (timber: stone abutments, plank deck, rails on posts; or concrete). Each is drawn once into its own
    // picture: drawn turned on every tile, its smoothed edges would differ a little from tile to tile.
    const bridgePics = (bridges || []).map((b) => {
      const dx = b.b.x - b.a.x, dy = b.b.y - b.a.y, L = Math.hypot(dx, dy), bw = b.w, ang = Math.atan2(dy, dx);
      const corners = [[-8, -bw / 2 - 5], [L + 8, -bw / 2 - 5], [-8, bw / 2 + 9], [L + 8, bw / 2 + 9]].map(([u, v]) => [b.a.x + u * Math.cos(ang) - v * Math.sin(ang), b.a.y + u * Math.sin(ang) + v * Math.cos(ang)]);
      const x0 = Math.floor(Math.min(...corners.map((c) => c[0]))) - 2, y0 = Math.floor(Math.min(...corners.map((c) => c[1]))) - 2;
      const x1 = Math.ceil(Math.max(...corners.map((c) => c[0]))) + 2, y1 = Math.ceil(Math.max(...corners.map((c) => c[1]))) + 2;
      const c = mkCanvas(x1 - x0, y1 - y0), g = c.getContext('2d');
      g.translate(b.a.x - x0, b.a.y - y0); g.rotate(ang);
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
    P = { bridges: bridgePics, stamps };
  }
  // Bridges and scenery over that part of the ground, already in g at (ox, oy).
  function decorate(g, X0, Y0, w, h, ox = 0, oy = 0) {
    if (!P) prepare();
    g.save();
    g.beginPath(); g.rect(ox, oy, w, h); g.clip();
    g.translate(ox - X0, oy - Y0);

    // Timber bridges (drawn once each, in prepare, so every tile gets the same pixels).
    for (const b of P.bridges) g.drawImage(b.c, b.x, b.y);

    // Scenery stamps that reach into this part, shadows first.
    const here = P.stamps.filter((s) => s.x1 > X0 && s.x0 < X0 + w && s.y1 > Y0 && s.y0 < Y0 + h);
    for (const s of here) if (s.s) { g.globalAlpha = 0.45; g.drawImage(s.s.sh, Math.round(s.x + s.s.sox), Math.round(s.y + s.s.soy)); g.globalAlpha = 1; }
    for (const s of here) {
      if (s.s) { g.drawImage(s.s.img, Math.round(s.x + s.s.ox), Math.round(s.y + s.s.oy)); continue; }
      const x = s.x, y = s.y;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1, y + 1, 5, 2);
      g.fillStyle = '#1f2e15'; g.fillRect(x - 2, y - 2, 5, 3);
      g.fillStyle = snow ? '#e4eaf2' : '#304a1d'; g.fillRect(x - 1, y - 3, 3, 2);   // in winter, snow on the bush
      g.fillStyle = snow ? '#ffffff' : '#46632a'; g.fillRect(x - 1, y - 3, 1, 1);
    }
    g.restore();
  }
  function paint(g, X0, Y0, w, h, ox = 0, oy = 0) {
    const img = g.createImageData(w, h);
    px.pixels(img.data, X0, Y0, w, h);
    g.putImageData(img, ox, oy);
    decorate(g, X0, Y0, w, h, ox, oy);
  }
  return { paint, decorate, args: [terr, seed, roads, cliffs, fords, theme] };
}
// Wheel ruts along the roads, worked out pixel by pixel (not stroked on the canvas, whose smoothing differs with
// where a picture's edge falls) so they run on unbroken across the ground's tiles. Each rut darkens or lightens a
// pixel once, however many of its segments cover it.
function paintRuts(d, roads, X0, Y0, w, h) {
  const mask = new Uint8Array(w * h);
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
        const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) || 1;
        for (let k = 0; k <= steps; k++) {
          const x = x0 + (x1 - x0) * k / steps, y = y0 + (y1 - y0) * k / steps;
          for (let py = Math.round(y - lw / 2); py < Math.round(y - lw / 2) + lw; py++) for (let px = Math.round(x - lw / 2); px < Math.round(x - lw / 2) + lw; px++) {
            if (px < X0 || py < Y0 || px >= X0 + w || py >= Y0 + h) continue;
            const q = (py - Y0) * w + px - X0;
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
function paintTerrain(terr, seed, roads, bridges, cliffs, fords, theme, bridgeKind) {
  const c = mkCanvas(WORLD, WORLD);
  groundPainter(terr, seed, roads, bridges, cliffs, fords, theme, bridgeKind).paint(c.getContext('2d'), 0, 0, WORLD, WORLD);
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
function paintCliffs(d, cells, seed, snow, X0, Y0, w, h) {
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
  const MX0 = X0 - 6, MY0 = Y0 - 7, MW = w + 8, MH = h + 9, hts = new Float32Array(MW * MH);
  let any = false;
  for (let cy = Math.floor(MY0 / CELL); cy <= Math.floor((MY0 + MH - 1) / CELL); cy++) for (let cx = Math.floor(MX0 / CELL); cx <= Math.floor((MX0 + MW - 1) / CELL); cx++) {
    if (cx < 0 || cy < 0 || cx >= MAP || cy >= MAP || !cells.has(cy * MAP + cx)) continue;
    any = true;
    for (let y = Math.max(MY0, cy * CELL); y < Math.min(MY0 + MH, (cy + 1) * CELL); y++) for (let x = Math.max(MX0, cx * CELL); x < Math.min(MX0 + MW, (cx + 1) * CELL); x++) hts[(y - MY0) * MW + x - MX0] = height(x, y);
  }
  if (!any) return;
  const H = (x, y) => (x < 0 || y < 0 || x >= WORLD || y >= WORLD ? 0 : hts[(y - MY0) * MW + x - MX0]);
  for (let y = Y0; y < Y0 + h; y++) for (let x = X0; x < X0 + w; x++) {
    if (!cells.has(Math.floor(y / CELL) * MAP + Math.floor(x / CELL))) continue;
    const p = ((y - Y0) * w + x - X0) * 4, hh = H(x, y), sp = hash(x, y, 9);
    if (hh <= 0.4) {
      const sh = H(x - 5, y - 6);   // the ridge's shadow on the ground below it
      if (sh > 5) { const k = sh > 9 ? 0.55 : 0.7; d[p] *= k; d[p + 1] *= k; d[p + 2] *= k; }
      else if (hh > 0 && sp < 0.35) { const t = ROCK[1 + Math.floor(sp * 8)]; d[p] = t[0]; d[p + 1] = t[1]; d[p + 2] = t[2]; }   // scree
      continue;
    }
    const gx = H(x + 1, y) - H(x - 1, y), gy = H(x, y + 1) - H(x, y - 1);
    const nl = Math.hypot(gx * 0.5, gy * 0.5, 1), lit = (-gx * 0.5 * lx - gy * 0.5 * ly + lz) / nl;
    let v = 2.3 + (lit - lz) * 7 + hh / CLIFF_H * 1.2 + (sp - 0.5) * 0.6;   // flat ground mid-brown, sunlit faces tan, the rest dark
    if (vn(x, y, 4, 5) > 0.72) v -= 1.2;   // cracks and gullies
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
function crater(tg, x, y, rad, seed) {
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
// A burnt-out wreck painted into the ground, so it stays for the rest of the battle.
// seed: the char pattern (given by the marks list, so a tile painted again shows the same wreck).
function bakeWreck(tg, x, y, def, face, tface, noTurret, seed = (Math.random() * 1e6) | 0) {
  const fake = { def, face, tface, load: 0 };
  const hs = hullSprite(fake, BURNT);
  if (hs.sh) { tg.globalAlpha = 0.45; tg.drawImage(hs.sh, Math.round(x + hs.sox), Math.round(y + hs.soy)); tg.globalAlpha = 1; }
  tg.drawImage(charred(hs.img, seed), Math.round(x + hs.ox), Math.round(y + hs.oy));
  const ts = !noTurret && turretSprite(fake, BURNT);
  if (ts) tg.drawImage(charred(ts.img, seed + 1), Math.round(x + ts.ox), Math.round(y - turretZ(def) * VK + ts.oy));
}
// A turret blown off by a cook-off, charred, at its height above the ground and turned by rot.
function turretImg(fx) {
  if (!fx.img) fx.img = charred(turretSprite({ def: fx.def, tface: fx.tface }, BURNT).img, fx.seed);
  return fx.img;
}
function drawTurretAt(g, fx, z) {
  const img = turretImg(fx);
  g.save(); g.translate(Math.round(fx.x), Math.round(fx.y - z - 3)); g.rotate(fx.rot);
  g.drawImage(img, -Math.round(img.width / 2), -Math.round(img.height / 2));
  g.restore();
}
function bakeTurret(tg, fx) {
  tg.fillStyle = 'rgba(0,0,0,0.35)';
  tg.beginPath(); tg.ellipse(fx.x + 2, fx.y + 1, 9, 4, 0, 0, 7); tg.fill();
  drawTurretAt(tg, fx, 0);
}
// A fallen soldier: the unit's own sprite tipped onto its side, a shade darker, over a dark stain.
function bakeCorpse(tg, u, seed, angle) {
  const r = rng(seed), s = infSprite({ type: u.type, faction: u.faction, face: u.face }, palFor(u.faction), 0);
  const a = angle !== undefined ? angle : (r() < 0.5 ? -1 : 1) * (Math.PI / 2) + (r() - 0.5) * 0.5, side = Math.sin(a) >= 0 ? 1 : -1;
  const x = Math.round(u.x), y = Math.round(u.y);
  tg.fillStyle = 'rgba(70,14,10,0.5)';
  tg.beginPath(); tg.ellipse(x + side * 6, y + 1, 6 + r() * 2, 3, 0, 0, 7); tg.fill();
  tg.fillStyle = 'rgba(0,0,0,0.28)';
  tg.beginPath(); tg.ellipse(x + side * 7, y + 2, 9, 3, 0, 0, 7); tg.fill();
  tg.save();
  tg.translate(x, y + 1); tg.rotate(a);
  const img = dimmed(s.img);
  tg.drawImage(img, Math.round(s.ox), Math.round(s.oy));
  tg.restore();
}
// A ragdoll's body, drawn limb by limb from its joints in the uniform's colours (and its
// loose weapon), nearest the camera last.
const cssOf = (c) => typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c;
function drawRagBody(g, fx) {
  const pal = palFor(fx.faction), K = infKit(pal, fx.faction), P = fx.P, burnt = fx.burnt;
  const tunic = burnt ? BURNT.main : pal.main, sleeve = burnt ? BURNT.dark : cssOf(shadeInt(pal.main, 0.86));
  const pants = burnt ? BURNT.deep : cssOf(K.pants), skin = burnt ? '#3a2e26' : K.skin;
  const head = fx.unitType === 'pilot' ? '#cfcab8' : fx.unitType === 'grenadier' ? '#5d6236' : cssOf(K.helm);
  const X = (i) => P[i * 3], Y = (i) => P[i * 3 + 1] - P[i * 3 + 2], Zk = (i) => P[i * 3 + 2] * 4 + P[i * 3 + 1];
  const parts = [];
  const seg = (i, j, w, col) => parts.push({ k: (Zk(i) + Zk(j)) / 2, f: (dark) => pxLine(g, X(i), Y(i), X(j), Y(j), dark ? w + 1 : w, dark ? '#16120e' : col) });
  seg(2, 7, 2, pants); seg(7, 9, 2, pants); seg(2, 8, 2, pants); seg(8, 10, 2, pants);
  seg(1, 2, 3, tunic); seg(3, 4, 2, tunic); seg(3, 5, 1, sleeve); seg(4, 6, 1, sleeve);
  if (fx.gun) {
    const q = fx.gun.P, rk = fx.unitType === 'rocket';
    parts.push({ k: (q[2] + q[5]) * 2 + (q[1] + q[4]) / 2, f: (dark) => pxLine(g, q[0], q[1] - q[2], q[3], q[4] - q[5], (rk ? 2 : 1) + (dark ? 1 : 0), dark ? '#16120e' : rk ? '#56603a' : C.gun) });
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
  g.fillStyle = '#16120e'; g.fillRect(Math.round(hx - 2), Math.round(hy - 2), 4, 4);
  g.fillStyle = skin; g.fillRect(Math.round(hx - 1.5), Math.round(hy - 1.5), 3, 3);
  g.fillStyle = burnt ? BURNT.light : head;
  g.fillRect(Math.round(hx + ux / ul * 1.2 - 1.5), Math.round(hy + uy / ul * 1.2 - 1.5), 3, 2);
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
  const c = mkCanvas(R * 2, R * 2), g = c.getContext('2d');
  g.translate(R - cx, R - cy); drawRagBody(g, fx);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(20,16,12,0.28)'; g.fillRect(0, 0, R * 2, R * 2);
  tg.drawImage(c, cx - R, cy - R);
}
function dimmed(img) {
  const c = mkCanvas(img.width, img.height), g = c.getContext('2d');
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
  const r = rng(seed), c = mkCanvas(img.width, img.height), g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(22,18,14,0.62)'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < c.width * c.height / 14; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? 'rgba(8,6,4,0.55)' : v < 0.8 ? 'rgba(96,52,26,0.45)' : 'rgba(120,112,100,0.3)';
    g.fillRect((r() * c.width) | 0, (r() * c.height) | 0, 1 + (r() * 2 | 0), 1);
  }
  return c;
}

// Worn earth around a structure, like the dirt aprons of classic bases.
function bibDecal(tg, x, y, w, h, seed) {
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
  const h = (i) => { let x = Math.imul(i, 374761393) ^ Math.imul(w.seed, 668265263); x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const f = t / 70, i = Math.floor(f), u = f - i, s = u * u * (3 - 2 * u);
  return 0.2 + 0.8 * (h(i) + (h(i + 1) - h(i)) * s);
}
// Draws the weather over the battle on the screen canvas g: the view's top left at world (vx, vy), vw x vh world
// pixels, k screen pixels a world pixel. Drops and flakes live in the world (they stay put as the camera moves) and
// wrap round the view.
const weatherFx = { parts: [], splash: [], last: 0, kind: null };
function drawWeather(g, w, vx, vy, vw, vh, k, t, paused) {
  const F = weatherFx, now = performance.now(), dt = paused ? 0 : Math.min(0.05, (now - F.last) / 1000 || 0);
  F.last = now;
  if (F.kind !== w.kind) { F.kind = w.kind; F.parts = []; F.splash = []; }
  const L = weatherLevel(w, t), rain = w.kind === 'rain';
  const want = Math.round((rain ? 330 : 300) * L * Math.min(3, (vw * vh) / (800 * 450)));
  const P = F.parts, rnd = Math.random;
  while (P.length < want) P.push({ x: vx + rnd() * vw, y: vy + rnd() * vh, s: 0.6 + rnd() * 0.8, ph: rnd() * 7 });
  if (P.length > want) P.length = want;
  const wrap = (v, a, n) => a + ((((v - a) % n) + n) % n);
  // A haze over everything: grey-blue overcast in rain, a pale veil in snow.
  g.fillStyle = rain ? `rgba(14,22,34,${(0.1 + 0.16 * L).toFixed(3)})` : `rgba(214,222,236,${(0.04 + 0.08 * L).toFixed(3)})`;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  if (rain) {
    const wind = 70;
    g.strokeStyle = 'rgba(180,200,220,0.5)'; g.lineWidth = Math.max(1, Math.round(k * 0.6));
    g.beginPath();
    for (const p of P) {
      p.y += 760 * p.s * dt; p.x -= wind * p.s * dt;
      p.x = wrap(p.x, vx - 20, vw + 40); p.y = wrap(p.y, vy - 20, vh + 40);
      const len = 9 + 7 * p.s, sx = (p.x - vx) * k, sy = (p.y - vy) * k;
      g.moveTo(Math.round(sx), Math.round(sy)); g.lineTo(Math.round(sx + wind / 760 * len * k), Math.round(sy - len * k));
    }
    g.stroke();
    // Splashes on the ground: a short-lived ring of dots.
    if (dt) for (let n = Math.round(90 * L * dt * (vw * vh) / (800 * 450) * 4); n > 0; n--) F.splash.push({ x: vx + rnd() * vw, y: vy + rnd() * vh, t: 0 });
    g.fillStyle = 'rgba(196,212,228,0.55)';
    const q = Math.max(1, Math.round(k));
    F.splash = F.splash.filter((s) => {
      s.t += dt;
      if (s.t > 0.16) return false;
      const r = (1 + s.t * 18) * k, sx = (s.x - vx) * k, sy = (s.y - vy) * k;
      g.fillRect(Math.round(sx - r), Math.round(sy), q, q); g.fillRect(Math.round(sx + r), Math.round(sy), q, q); g.fillRect(Math.round(sx), Math.round(sy - r * 0.6), q, q);
      return true;
    });
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
  crater: ([x, y, rad]) => [x, y, rad * 1.8 + 4],
  bakeWreck: ([x, y]) => [x, y, 96],
  bakeTurret: ([fx]) => [fx.x, fx.y, 48],
  bakeRagdoll: ([fx]) => [fx.P[6], fx.P[7], 48],
};
const markBox = (n, a) => {
  if (n === 'bibDecal') return [a[0] - 12, a[1] - 12, a[0] + a[2] + 12, a[1] + a[3] + 12];
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
      'let MAP = 0, WORLD = 0, NCELLS = 0;',
      ...[rng, groundPixels, cliffCells, paintCliffs, paintRuts, fordStone].map(String),
      `let px = null, gen = -1, pvBuf = null;
      onmessage = (e) => {
        const m = e.data;
        if (m.init) { gen = m.gen; MAP = m.MAP; WORLD = MAP * CELL; NCELLS = MAP * MAP; px = groundPixels(...m.args); return; }
        // (the buffer comes back from the main thread to be used again: no new 256 KB block for every tile)
        const size = m.w * m.h * 4, d = m.buf && m.buf.byteLength === size ? new Uint8ClampedArray(m.buf) : pvBuf && pvBuf.byteLength === size && m.pv ? new Uint8ClampedArray(pvBuf) : new Uint8ClampedArray(size);
        if (m.pv) pvBuf = d.buffer;
        if (m.gen === gen) px.pixels(d, m.x, m.y, m.w, m.h);
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
  const tileCanvas = () => { const c = spare.pop(); if (!c) return mkCanvas(T, T); c.getContext('2d').clearRect(0, 0, T, T); return c; };
  const tileOf = (tx, ty) => ty * n + tx;
  const at = (k) => [(k % n) * T, Math.floor(k / n) * T];
  // With workers: the tiles wanted, in order (on screen nearest the middle first, then the ring round it), those
  // being worked out, and those whose pixels are back and wait to be finished on the main thread.
  const pool = legacy ? null : groundWorkers(), gen = ++groundGen;
  // The preview: the whole ground at a quarter size, worked out by the workers when they have nothing else to do
  // (and taken from every finished tile), shown blurred where a tile is not painted yet, instead of flat blocks.
  const PV = 4, pvDone = new Uint8Array(n * n), pvBusy = new Set();
  let pvCount = 0;   // tiles of the preview done
  const pvMark = (k) => { if (!pvDone[k]) { pvDone[k] = 1; pvCount++; } };
  let shown = new Set();   // tiles on screen last frame as a stand-in: when they come in, they fade in
  // Baked ground (GroundSheets): the sheets decoded so far (a phone keeps the 12 last used), those loading; a tile is
  // cut from its sheet. If a file will not load, the ground is painted as before (bk.failed).
  const SH = GROUND_SHEET, per = Math.ceil(WORLD / SH);
  const bk = !legacy && baked ? { sheets: new Map(), loading: new Set(), keep: GROUND_ROOMY ? Infinity : 12, failed: false } : null;
  const fast = () => bk && !bk.failed;
  const fetchPic = (f) => fetch(baked.dir + f).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.blob(); }).then((b) => createImageBitmap(b));
  if (bk) {
    fetchPic('preview.webp').then((bmp) => {
      if (bk.failed) return;
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
    tiles.set(k, f.t); finished++;
    if (!pvDone[k] && pool) { const [x0, y0] = at(k), g = pvCtx(); g.imageSmoothingEnabled = true; g.drawImage(f.t.g, 0, 0, Math.min(T, WORLD - x0), Math.min(T, WORLD - y0), x0 / PV, y0 / PV, Math.min(T, WORLD - x0) / PV, Math.min(T, WORLD - y0) / PV); pvMark(k); }
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
      w.postMessage({ gen, k, x: x0, y: y0, w: Math.min(T, WORLD - x0), h: Math.min(T, WORLD - y0), buf }, buf ? [buf] : []);
    }
  }
  // A tile whose pixels came back from a worker: into a canvas, bridges and scenery on top, then the marks (finishSome).
  function finish(k, m) {
    const [x0, y0] = at(k), t = { g: tileCanvas(), d: null, used: frameNo }, g = t.g.getContext('2d');
    const a = performance.now();
    if (m.bmp) {   // baked: the tile cut from its sheet, bridges and scenery included
      g.drawImage(m.bmp, m.sx, m.sy, m.w, m.h, 0, 0, m.w, m.h);
      peak.put = Math.max(peak.put, performance.now() - a);
      finishing.set(k, { t, i: 0 });
      return;
    }
    g.putImageData(new ImageData(m.d, m.w, m.h), 0, 0);
    if (bufs.length < 8) bufs.push(m.d.buffer);
    const b = performance.now();
    painter.decorate(g, x0, y0, m.w, m.h, 0, 0);
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
  function markPic(m) {
    const bx = Math.floor(m[3]), by = Math.floor(m[4]), w = Math.ceil(m[5]) - bx + 1, h = Math.ceil(m[6]) - by + 1;
    if (!scratch || scratch.width < w || scratch.height < h) scratch = mkCanvas(Math.max(w, scratch ? scratch.width : 256), Math.max(h, scratch ? scratch.height : 256));
    const g = scratch.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.save(); g.translate(-bx, -by); drawMark(g, m); g.restore();
  }
  function copyOn(t, k, m) {
    if (m[0] === 'd' && !t.d) t.d = tileCanvas();
    const [x0, y0] = at(k), bx = Math.floor(m[3]), by = Math.floor(m[4]), w = Math.ceil(m[5]) - bx + 1, h = Math.ceil(m[6]) - by + 1;
    (m[0] === 't' ? t.g : t.d).getContext('2d').drawImage(scratch, 0, 0, w, h, bx - x0, by - y0, w, h);
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
      painter.paint(g, x0, y0 + p.row, w, rows, 0, p.row);
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
  const tilesIn = (sx, sy, sw, sh) => {
    const out = [], mx = sx + sw / 2, my = sy + sh / 2;
    for (let ty = Math.max(0, Math.floor(sy / T)); ty <= Math.min(n - 1, Math.floor((sy + sh - 1) / T)); ty++)
      for (let tx = Math.max(0, Math.floor(sx / T)); tx <= Math.min(n - 1, Math.floor((sx + sw - 1) / T)); tx++) out.push(tileOf(tx, ty));
    const dist = (k) => { const [x, y] = at(k); return Math.hypot(x + T / 2 - mx, y + T / 2 - my); };
    return out.sort((a, b) => dist(a) - dist(b));
  };
  return {
    add, tiles, missing: 0,
    // Before drawing a frame of view rect (sx, sy, sw, sh): paints what is missing on screen for up to `ms`
    // milliseconds, then (`ahead` ms) the tiles in a ring round it, so scrolling finds them ready. The first frame
    // paints all it shows, however long that takes.
    // With workers, `ms` is the time for finishing tiles whose pixels are back, on screen first, and the workers are
    // given the tiles on screen, then the ring.
    update(sx, sy, sw, sh, ms, ahead) {
      frameNo++;
      peak.put = peak.dec = peak.mark = 0; peak.mk = '';
      pvCenter = tileOf(Math.max(0, Math.min(n - 1, Math.floor((sx + sw / 2) / T))), Math.max(0, Math.min(n - 1, Math.floor((sy + sh / 2) / T))));
      const tIn = performance.now(), had = finished;
      try { this.upd(sx, sy, sw, sh, ms, ahead); } finally { this.ms = performance.now() - tIn; this.made = finished - had; }
    },
    ms: 0, made: 0, peak, blocky: 0,   // the last update's time, tiles finished and worst steps (Report: stats.frames)
    upd(sx, sy, sw, sh, ms, ahead) {
      const t0 = performance.now(), seen = tilesIn(sx, sy, sw, sh);
      if (fast() || (drawn && useWorkers())) {   // (baked: the first frame waits for its sheets too, behind the deploying card)
        const want = seen.filter((k) => !tiles.has(k));
        for (const k of tilesIn(sx - T, sy - T, sw + 2 * T, sh + 2 * T)) if (!tiles.has(k) && !want.includes(k)) want.push(k);
        const near = want.length;
        // A roomy computer, once the preview is done: the rest of the map, nearest the view first, a few at a time
        // (finished with the `ahead` time only, after what is on and round the screen).
        if (GROUND_ROOMY && pvCount === n * n && tiles.size + finishing.size < n * n) {
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
        const ring = tilesIn(sx - T, sy - T, sw + 2 * T, sh + 2 * T).filter((k) => !tiles.has(k));
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
      trim(GROUND_ROOMY ? n * n : Math.max(140, seen.length * 3));
    },
    // Draws one layer ('t' the ground, 'd' the wrecks and bodies) of world rect (sx, sy, sw, sh) into g at (dx, dy).
    draw(g, layer, sx, sy, sw, sh, dx, dy) {
      if (sw <= 0 || sh <= 0) return;
      for (const k of tilesIn(sx, sy, sw, sh)) {
        const t = tiles.get(k), [x0, y0] = at(k);
        const ix = Math.max(sx, x0), iy = Math.max(sy, y0), iw = Math.min(sx + sw, x0 + T, WORLD) - ix, ih = Math.min(sy + sh, y0 + T, WORLD) - iy;
        if (iw <= 0 || ih <= 0) continue;
        const standIn = () => {
          if (pvDone[k]) {   // the preview, blurred up
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
          g.drawImage(c, ix - x0, iy - y0, iw, ih, dx + ix - sx, dy + iy - sy, iw, ih);
          g.globalAlpha = a;
        } else { t.born = 0; g.drawImage(c, ix - x0, iy - y0, iw, ih, dx + ix - sx, dy + iy - sy, iw, ih); }
      }
    },
    // The whole of one layer in one picture (tests only: too big for a phone on large maps).
    whole(layer) {
      const c = mkCanvas(WORLD, WORLD), g = c.getContext('2d');
      for (let k = 0; k < n * n; k++) {
        if (!tiles.has(k)) paintSome(k, 0);
        const t = tiles.get(k), cv = layer === 't' ? t.g : t.d, [x0, y0] = at(k);
        if (cv) g.drawImage(cv, x0, y0);
      }
      return c;
    },
    forget() { tiles.clear(); pending.clear(); ready.clear(); finishing.clear(); },
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
  const baked = bm && bm.key === groundKey(g) ? { dir: 'grounds/' + id + '/' } : null;
  g.ground = makeGround(groundPainter(g.terr, groundSeed(g), g.road, g.bridges, g.cliff, g.ford, mapTheme(g.mapId), MAPS[id].bridge), legacy, baked);
  g.ground.baked = !!baked;
  const G0 = G; G = g;   // (add reads G.marks)
  try { for (let i = 0; i < g.marks.length; i++) g.ground.add(i); } finally { G = G0; }
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
          if (pose === 7 && (best.type === 'rocket' || best.type === 'grenadier' || best.type === 'pilot')) continue;
          for (let i = 0; i < 16; i++) warmJobs.push({ v, run: () => infSprite({ type: best.type, faction: f, face: i * Math.PI / 8 }, palFor(f), pose) });
        }
      } else {
        const looks = def.draw === 'v2' ? [{ cd: 0 }, { cd: 2 }] : def.draw === 'harv' ? [{ load: 0 }, { load: def.capacity }] : [{}];
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
function drawUnit(g, u, t) {
  drawVar = G.teams[u.team].variant | 0;
  const pal = palFor(u.faction);
  if (u.cls === 'inf') {
    if (u.chute > 0) { drawChute(g, u, pal, t); return; }
    // As in Red Alert: a four-pose walk, the weapon brought up to the shoulder to shoot (and held
    // there a moment), dropping prone under fire through a crouch, crawling, and getting up again.
    const prone = u.stance === 'prone', gun = u.type !== 'rocket' && u.type !== 'grenadier' && u.type !== 'pilot';
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
    const rk = u.fireT > 0 && (frame === 7 || frame === 5 || (frame === 0 && u.type === 'rocket')) ? Math.min(1, u.fireT / 0.1) * 1.5 : 0;
    blit(g, infSprite(u, pal, frame), u.x - Math.cos(u.face) * rk, u.y - Math.sin(u.face) * rk - (frame === 12 || frame === 13 ? 1 : 0));
    const mh = frame === 11 ? 20 : frame === 7 ? 13 : stance === 'prone' ? 2 : stance === 'crouch' ? 6 : 11, mr = frame === 11 || frame === 7 ? 13 : stance === 'prone' ? 12 : 10;
    if (u.fireT > 0) flash(g, u.x + Math.cos(u.face) * mr, u.y + Math.sin(u.face) * mr - mh, 1);
    return;
  }
  if (u.cls === 'air') {
    const alt = u.alt || 0, hgt = alt / VK, s = hullSprite(u, pal);
    if (s.sh) { g.globalAlpha = 0.38; g.drawImage(s.sh, Math.round(u.x + hgt * SHADOW_DX + s.sox), Math.round(u.y + hgt * SHADOW_DY + s.soy)); g.globalAlpha = 1; }
    blit(g, s, u.x, u.y - alt, false);
    if (u.def.fly === 'heli') {
      // The rotor turns faster than any screen can show, so each frame it advances as far as it
      // can without seeming to run backwards (under half the gap between blades, whatever the
      // frame rate) and the blur of the arc it swept fills in the rest.
      const n = u.type === 'hind' ? 5 : 4, gap = Math.PI * 2 / n, flying = alt > 1;
      const rz = (u.type === 'hind' ? 10 : 9) * VK, rx = u.x, ry = u.y - alt - rz, R = u.type === 'hind' ? 15 : 13;
      const dtf = u.rotT === undefined ? 0 : Math.min(0.1, Math.max(0, t - u.rotT));
      const step = Math.min((flying ? 80 : 6) * dtf, gap * 0.42);
      u.rotT = t; u.rotA = (u.rotA === undefined ? u.id : u.rotA) + step;
      g.fillStyle = flying ? 'rgba(40,40,36,0.26)' : 'rgba(0,0,0,0)';
      g.beginPath(); g.ellipse(rx, ry, R, R * 0.92, 0, 0, 7); g.fill();
      g.lineWidth = 1.2;
      const trails = flying ? 4 : 1;
      for (let c = trails - 1; c >= 0; c--) {
        g.strokeStyle = `rgba(28,28,24,${c ? 0.32 * (1 - c / trails) : 0.85})`;
        g.beginPath();
        for (let k = 0; k < n; k++) {
          const a = u.rotA - c * step / trails * 1.6 + k * gap;
          g.moveTo(rx, ry); g.lineTo(rx + Math.cos(a) * R, ry + Math.sin(a) * R * 0.92);
        }
        g.stroke();
      }
      if (u.type === 'heli') {   // the Longbow radar dome on top of the mast
        g.fillStyle = '#4c5149'; g.beginPath(); g.ellipse(rx, ry - 1.5, 2.6, 1.9, 0, 0, 7); g.fill();
        g.fillStyle = '#6b7166'; g.beginPath(); g.ellipse(rx - 0.5, ry - 2.1, 1.4, 0.9, 0, 0, 7); g.fill();
      }
    } else if (u.moving) {
      const bx = u.x - Math.cos(u.face) * 15, by = u.y - alt - 2 + -Math.sin(u.face) * 15;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,210,110,0.9)' : 'rgba(255,140,50,0.9)';
      g.beginPath(); g.arc(bx, by, 1.6, 0, 7); g.fill();
    }
    if (u.fireT > 0) flash(g, u.x + Math.cos(u.face) * 10, u.y - alt + Math.sin(u.face) * 10, 2);
    // Parked: ammunition pips fill up as the ground crew rearms it.
    // Repairs under way: the same blinking green cross as structures.
    if (u.repairing && Math.floor(t * 3) % 2) {
      const cx = Math.round(u.x), cy = Math.round(u.y - 14);
      g.fillStyle = '#000'; g.fillRect(cx - 4, cy - 4, 9, 9);
      g.fillStyle = '#3ed04a'; g.fillRect(cx - 3, cy - 1, 7, 3); g.fillRect(cx - 1, cy - 3, 3, 7);
    }
    // Yellow: main weapon, blue: air-to-air missiles, grey: gun runs.
    if (u.as === 'landed' && u.def.weapon) {
      const loads = [[u.def.weapon.ammo, u.ammo, '#e8c64a'], [u.def.weapon2 ? u.def.weapon2.ammo : 0, u.aam || 0, '#9cc8ff'], [u.def.gun ? u.def.gun.runs : 0, u.guns || 0, '#b8b6aa']];
      const n = loads.reduce((s, l) => s + l[0], 0), x0 = Math.round(u.x - n * 1.5), y0 = Math.round(u.y + 9);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x0 - 1, y0 - 1, n * 3 + 1, 4);
      let i = 0;
      for (const [max, have, col] of loads) for (let j = 0; j < max; j++, i++) { g.fillStyle = j < have ? col : '#4a4436'; g.fillRect(x0 + i * 3, y0, 2, 2); }
    }
    return;
  }
  // A tank gun firing kicks the turret back along the barrel (recoil); the hull stays put.
  const rk = u.def.weapon && u.def.weapon.proj === 'shell' && !isAirborne(u) ? recoil(u) : 0;
  const kick = rk * (u.type === 'mammoth' || u.type === 'htank' ? 2 : 1.6);
  blit(g, hullSprite(u, pal), u.x, u.y);
  const ts = turretSprite(u, pal);
  if (ts) {
    const z = turretZ(u.def) * VK, off = u.def.draw === 'jeep' ? -3 : -1;
    const tx = u.x + Math.cos(u.face) * off - Math.cos(u.tface) * kick, ty = u.y + Math.sin(u.face) * off - z - Math.sin(u.tface) * kick * 0.6;
    blit(g, ts, tx, ty, false);
    if (u.fireT > 0) {
      const len = u.def.size.tur ? u.def.size.tur + u.def.size.barrel : 8;
      const side = u.def.weapon && u.def.weapon.stagger && u.barrel ? u.barrel * 1.6 : 0;   // a staggered twin gun: at the barrel that fired
      flash(g, tx + Math.cos(u.tface) * len + Math.sin(u.tface) * side, ty + Math.sin(u.tface) * len - Math.cos(u.tface) * side - 1.5, u.def.draw === 'jeep' ? 1 : 2);
    }
  }
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
function drawChute(g, u, pal, t) {
  const h = u.chute * 26, sway = Math.sin(t * 2.4 + u.id) * 2, x = u.x + sway, y = u.y - h;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(u.x, u.y, 6, 3, 0, 0, 7); g.fill();
  blit(g, infSprite(u, pal, 0), x, y);
  const cy = y - 31;
  g.strokeStyle = '#2a2620'; g.lineWidth = 0.8;
  g.beginPath();
  for (const dx of [-9, -4, 4, 9]) { g.moveTo(x + dx, cy + 1); g.lineTo(x + dx * 0.15, y - 18); }
  g.stroke();
  g.fillStyle = '#d9d2bc';
  g.beginPath(); g.ellipse(x, cy, 10, 7, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#a69d82';
  g.beginPath(); g.ellipse(x, cy, 10, 2, 0, 0, Math.PI); g.fill();
  g.fillRect(Math.round(x - 1), Math.round(cy - 7), 2, 7);
}

// Burnt-out wreck: the same model with charred paint.
function drawHusk(g, fx) {
  const fake = { def: fx.def, face: fx.face, tface: fx.tface, load: 0 };
  g.globalAlpha = Math.min(1, (1 - fx.t / fx.life) * 4);
  blit(g, hullSprite(fake, BURNT), fx.x, fx.y);
  const ts = turretSprite(fake, BURNT);
  if (ts) blit(g, ts, fx.x, fx.y - turretZ(fx.def) * VK, false);
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
function drawStructure(g, b, t) {
  drawVar = G.teams[b.team].variant | 0;
  const camo = b.type === 'pillbox' ? groundColour(b) : undefined;
  const s = structureSprite(b.type, b.faction, camo);
  const x = b.cx * CELL, y = b.cy * CELL;
  let k = b.buildT;
  if (b.sellT > 0) k = Math.min(k, b.sellT / 1.2);
  if (k < 1) {
    // Build-up: the structure rises out of its foundation behind a scaffold line.
    const H = s.img.height, hh = Math.max(1, Math.round(H * k));
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, y, b.w * CELL, b.h * CELL);
    g.drawImage(s.img, 0, H - hh, s.img.width, hh, Math.round(x + s.ox), Math.round(y + s.oy + H - hh), s.img.width, hh);
    g.fillStyle = '#d8b13a'; g.fillRect(x, Math.round(y + s.oy + H - hh), b.w * CELL, 1);
    return;
  }
  const stage = dmgStage(b);
  blit(g, stage ? damagedSprite(b.type, b.faction, stage, camo) : s, x, y);
  const head = HEADS[b.type];
  if (b.type === 'sam') drawSamHead(g, b, x, y, stage);
  else if (head) {
    const kick = b.type === 'turret' ? recoil(b) * 1.6 : 0;   // the Gun Turret's head kicks back when it fires
    const hx = x + head[1] - Math.cos(b.tface) * kick, hy = y + head[2] - head[3] * VK - Math.sin(b.tface) * kick * 0.6;
    blit(g, headSprite(b.type, b.faction, b.tface, stage), hx, hy, false);
    if (b.type === 'ftur') {   // a burst of fire at the projector's mouth, not a gun flash
      if (b.fireT > 0) { g.fillStyle = 'rgba(255,140,40,0.85)'; g.beginPath(); g.arc(hx + Math.cos(b.tface) * 10, hy + Math.sin(b.tface) * 10 - 3, 4 + Math.random() * 2, 0, 7); g.fill(); }
    } else if (b.fireT > 0) flash(g, hx + Math.cos(b.tface) * 14, hy + Math.sin(b.tface) * 14 - 2, 2);
  }
  if (b.type === 'pillbox' && b.fireT > 0) { const m = muzzle(b); flash(g, m.x, m.y, 2); }
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
          g.fillRect(Math.round(fx.x + Math.cos(a) * v * k), Math.round(fx.y + Math.sin(a) * v * k * 0.7 - Math.sin(k * Math.PI) * fx.size), 2, 1);
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
    case 'fire': {
      const f = flameFrames[Math.floor(fx.t * 12 + (fx.x | 0)) % 4], sc = fx.s || 1;
      g.globalAlpha = Math.min(1, (1 - k) * 3);
      if (sc > 1.3) {   // a big blaze lights up what is around it
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = `rgba(255,120,30,${0.12 * Math.min(1, (1 - k) * 3)})`;
        g.beginPath(); g.arc(fx.x, fx.y - 4 * sc, 6 * sc, 0, 7); g.fill();
        g.globalCompositeOperation = 'source-over';
      }
      if (sc === 1) g.drawImage(f, Math.round(fx.x - 3), Math.round(fx.y - 11));
      else { const w = Math.round(7 * sc * (1 - k * 0.4)), h = Math.round(12 * sc * (1 - k * 0.5)); g.drawImage(f, Math.round(fx.x - w / 2), Math.round(fx.y - h + 1), w, h); }
      g.globalAlpha = 1;
      break;
    }
    case 'tracer': {
      g.globalAlpha = 1 - k;
      g.strokeStyle = '#ffe48a'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(fx.x, fx.y); g.lineTo(fx.x2, fx.y2); g.stroke();
      g.fillStyle = '#fffbe0'; g.fillRect(Math.round(fx.x2 - 1), Math.round(fx.y2 - 1), 2, 2);
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
      g.globalAlpha = 1 - k * 0.6;
      for (let pass = 0; pass < 3; pass++) {
        g.strokeStyle = pass === 2 ? '#ffffff' : pass === 1 ? 'rgba(150,200,255,0.9)' : 'rgba(80,130,255,0.35)';
        g.lineWidth = pass === 2 ? 1 : pass === 1 ? 2 : 5;
        g.beginPath(); g.moveTo(fx.x, fx.y);
        const n = 9;
        for (let i = 1; i < n; i++) {
          const tt = i / n;
          g.lineTo(fx.x + (fx.x2 - fx.x) * tt + (r() - 0.5) * 11, fx.y + (fx.y2 - fx.y) * tt + (r() - 0.5) * 11);
        }
        g.lineTo(fx.x2, fx.y2); g.stroke();
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
        g.beginPath(); g.moveTo(tr[i - 1].x, tr[i - 1].y); g.lineTo(tr[i].x, tr[i].y); g.stroke();
      }
      if (a <= 0) break;
      const fl = 0.75 + Math.random() * 0.25;
      g.fillStyle = `rgba(255,150,40,${0.22 * a * fl})`; g.beginPath(); g.arc(fx.x, fx.y, 7, 0, 7); g.fill();
      g.fillStyle = `rgba(255,190,80,${0.45 * a * fl})`; g.beginPath(); g.arc(fx.x, fx.y, 4, 0, 7); g.fill();
      g.fillStyle = `rgba(255,252,235,${a})`; g.fillRect(Math.round(fx.x - 1.5), Math.round(fx.y - 1.5), 3, 3);
      break;
    }
    case 'crash': {
      // A downed aircraft tumbling toward its shadow. Its roll squashes the sprite across the
      // line of flight (wings edge-on), upside down it shows its darker belly.
      const fake = { def: fx.def, face: fx.face, faction: fx.faction }, s = hullSprite(fake, palFor(fx.faction)), hgt = fx.alt / VK;
      const sq = Math.max(0.2, Math.abs(Math.cos(fx.roll || 0))), inv = Math.cos(fx.roll || 0) < 0;
      const squash = (x, y) => { g.translate(x, y); g.rotate(fx.face); g.scale(1, sq); g.rotate(-fx.face); };
      if (s.sh) {
        g.save(); squash(fx.x + hgt * SHADOW_DX, fx.y + hgt * SHADOW_DY);
        g.globalAlpha = 0.3; g.drawImage(s.sh, Math.round(s.sox), Math.round(s.soy)); g.restore();
      }
      g.save(); squash(fx.x, fx.y - fx.alt);
      if (inv) g.filter = 'brightness(0.55)';
      g.drawImage(s.img, Math.round(s.ox), Math.round(s.oy)); g.restore();
      if (!fx.jet && !fx.ground) {   // the rotor still turning, losing speed
        const rz = 9 * VK, ra = fx.t * 25;
        g.strokeStyle = 'rgba(28,28,24,0.75)'; g.lineWidth = 1.2; g.beginPath();
        for (let i = 0; i < 2; i++) { const a = ra + i * Math.PI / 2; g.moveTo(fx.x - Math.cos(a) * 13, fx.y - fx.alt - rz - Math.sin(a) * 12); g.lineTo(fx.x + Math.cos(a) * 13, fx.y - fx.alt - rz + Math.sin(a) * 12); }
        g.stroke();
      }
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,170,60,0.85)' : 'rgba(255,110,30,0.85)';
      g.beginPath(); g.arc(fx.x + (Math.random() - 0.5) * 6, fx.y - fx.alt + (Math.random() - 0.5) * 4, 2.5 + Math.random() * 2, 0, 7); g.fill();
      if (fx.ground) {   // sparks off the belly as it scrapes along
        g.fillStyle = 'rgba(255,220,140,0.9)';
        for (let i = 0; i < 3; i++) g.fillRect(Math.round(fx.x - fx.vx * 0.04 * (1 + i) + (Math.random() - 0.5) * 8), Math.round(fx.y - fx.vy * 0.04 * (1 + i) + (Math.random() - 0.5) * 4), 1, 1);
      }
      break;
    }
    case 'eject': {
      // The seat and pilot riding the rocket up, flame beneath.
      const hgt = fx.alt / VK, y = fx.y - fx.alt;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(fx.x + hgt * SHADOW_DX, fx.y + hgt * SHADOW_DY, 3, 2, 0, 0, 7); g.fill();
      if (fx.t < 0.3) {
        g.fillStyle = 'rgba(255,200,90,0.9)'; g.beginPath(); g.ellipse(fx.x, y + 6, 1.6, 3.5 + Math.random() * 2, 0, 0, 7); g.fill();
      }
      g.fillStyle = '#2b2b27'; g.fillRect(Math.round(fx.x - 2.5), Math.round(y - 1), 5, 5);
      blit(g, infSprite({ type: 'pilot', faction: fx.faction, face: fx.face }, palFor(fx.faction), 4), fx.x, y + 3, false);
      break;
    }
    case 'frag': {
      // A loose piece of wreckage: shadow below, the piece turning as it flies.
      const hgt = fx.alt / VK, fade = Math.min(1, (fx.life - fx.t) / 1.5);
      g.globalAlpha = fade;
      if (fx.alt > 0.5) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(Math.round(fx.x + hgt * SHADOW_DX - fx.w / 2), Math.round(fx.y + hgt * SHADOW_DY), Math.ceil(fx.w), 1); }
      g.save(); g.translate(fx.x, fx.y - fx.alt); g.rotate(fx.rot); g.scale(1, 0.6 + 0.4 * Math.abs(Math.cos(fx.rot * 1.7)));
      g.fillStyle = fx.color; g.fillRect(-fx.w / 2, -fx.h / 2, fx.w, fx.h);
      if (fx.burning && fx.t < 3) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,170,60,0.9)' : 'rgba(255,110,30,0.9)'; g.fillRect(-1, -1, 2, 2); }
      g.restore(); g.globalAlpha = 1;
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
function cameoURL(type, faction, variant) {
  const v = variant | 0, key = type + faction + v;
  if (cameoCache.has(key)) return cameoCache.get(key);
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
    mdl = power === 'spy' ? jetModel(pal, faction === 'soviets') : power === 'para' ? (faction === 'allies' ? c130Model(pal) : il76Model(pal)) : power === 'bomb' ? (faction === 'allies' ? b1Model(pal) : tu22Model(pal)) : cargoModel(pal, power === 'bomb');
    scale = power === 'spy' ? 1.6 : 1.05;
  } else if (BUILD_DEFS[type]) {
    mdl = STRUCTURES[type](pal, faction, true);
    angle = 0;
    const d = BUILD_DEFS[type], fw = d.w * CELL + 4, fh = d.h * CELL + mdl.d * VK;
    scale = Math.min(1.3, (W - 2) / fw, (H - 2) / fh);
  } else {
    const d = UNIT_DEFS[type];
    if (d.cls === 'inf') mdl = infModel(pal, faction, type, 0);
    else if (d.draw === 'tank') mdl = tankHull(pal, d.size);
    else if (d.draw === 'jeep') mdl = jeepModel(pal);
    else if (d.draw === 'harv') mdl = harvModel(pal, true);
    else if (d.draw === 'fob') mdl = fobModel(pal);
    else if (d.draw === 'mcv') mdl = mcvModel(pal);
    else if (d.draw === 'arty') mdl = artyModel(pal);
    else if (d.draw === 'v2') mdl = v2Model(pal, true);
    else if (d.fly === 'heli') mdl = type === 'hind' ? hindModel(pal) : heliModel(pal);
    else mdl = jetModel(pal, type === 'mig');
    scale = d.cls === 'inf' ? 3.2 : d.fly === 'jet' ? 1.75 : d.fly ? 1.7 : d.size && d.size.len > 22 ? 1.9 : 2.3;
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
  if (d && (d.draw === 'tank' || d.draw === 'jeep')) {
    const tm = d.draw === 'tank' ? tankTurret(pal, d.size) : mgModel(pal);
    const ts = renderVox(tm, angle, { scale, shadow: false });
    const z = turretZ(d) * VK * scale, off = (d.draw === 'jeep' ? -3 : -1) * scale;
    const ox = dx - s.ox * scale, oy = dy - s.oy * scale;
    g.drawImage(ts.img, Math.round(ox + Math.cos(angle) * off + ts.ox * scale), Math.round(oy + Math.sin(angle) * off - z + ts.oy * scale));
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeRect(0.5, 0.5, W - 1, H - 1);
  const url = c.toDataURL();
  cameoCache.set(key, url);
  return url;
}
