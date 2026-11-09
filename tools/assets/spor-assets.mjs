/**
 * Every approved region model the game ships, for tools/assets/pack-spor.mjs.
 * src: path under the shared regions folder. budget: most LOD0 triangles kept (bigger LOD0s are
 * simplified). dir: subfolder of src/assets/spor (ic = interior props for the interior designer).
 */
const P = 'spor-ormani/polish/glb/';
const G = 'spor-ormani/glb/';
const H = 'evler-kat/glb/';
const list = (folder, names, extra = {}) => names.map((n) => ({ name: n, src: `${folder}${n}.glb`, ...extra }));

export const ASSETS = [
  // Mushrooms, enoki, moss, sprouts (painted pass).
  ...list(P, ['mantar_kucuk', 'mantar_orta', 'mantar_buyuk', 'mantar_kumesi', 'mantar_kume_1', 'mantar_kume_2', 'mantar_kume_3', 'mantar_kume_4', 'mantar_kume_5'], { budget: 30_000 }),
  ...list(P, ['mantar_semsiye', 'mantar_murekkep', 'mantar_huni', 'mantar_mercan', 'mantar_cin'], { budget: 20_000 }),
  ...list(P, ['mantar_mavi_patlak', 'morel_ziplama'], { budget: 40_000 }),
  ...list(P, ['enoki_seyrek', 'enoki_kucuk', 'enoki_orta', 'enoki_buyuk'], { budget: 8_000 }),
  ...list(P, ['yosun_tumsek', 'kizil_filiz']),
  ...list(P, ['cimen_kucuk', 'cimen_orta', 'cimen_genis', 'cimen_uzun', 'cimen_cicekli', 'cimen_basak']),
  // Houses (mushroom houses, glass houses, Gaudí houses), rebuilt to the storey spec (ground 4.5 m,
  // upper floors 4.0 m, slabs 0.5 m, doors 2.0 x 2.8 m) in regions/evler-kat.
  ...list(H, ['ev_kule', 'ev_genis', 'ev_kulube', 'ev_iki_kat', 'ev_uc_kat'], { budget: 70_000 }),
  ...list(H, ['ev_cam_kule', 'ev_cam_ikiz', 'ev_cam_genis'], { budget: 70_000 }),
  ...list(H, ['ev_mozaik', 'ev_vitray'], { budget: 90_000 }),
  // Bridges.
  ...list(P, ['kopru_tas', 'kopru_tas_yikik', 'kopru_ahsap'], { budget: 40_000 }),
  ...list(G, ['kopru_gaudi_mozaik', 'kopru_gaudi_viyaduk', 'kopru_gecit_12', 'kopru_gecit_20', 'kopru_gecit_20_kat', 'kopru_gecit_28'], { budget: 40_000 }),
  // Fantastical trees.
  // The temple tree's door leaves (and the light round them) are cut away: the owner wants no door there,
  // the pointed-arch niche and its stone frame stay.
  ...list('spor-ormani/agac/glb/', ['agac_tapinak'], { budget: 70_000, cut: [[-1.22, 1.22, -3.33, -2.9, 1.48, 6.95]] }),
  ...list('spor-ormani/agac/glb/', ['agac_isik_sogut', 'agac_gokkusagi', 'agac_masal_mesesi', 'agac_yelpaze', 'agac_kizil_semsiye', 'agac_denizanasi', 'agac_lingzhi', 'agac_kehribar'], { budget: 70_000 }),
  // Mycelium column passage.
  ...list('spor-ormani/gecit/glb/', ['gecit_duz', 'gecit_kavis', 'gecit_son'], { budget: 60_000 }),
  // Mushroom-woman statue and the mycelium maze kit.
  ...list('spor-ormani/heykel/glb/', ['heykel_mantar_kadin'], { budget: 150_000 }),
  ...list('spor-ormani/heykel/glb/', ['labirent_duvar_a', 'labirent_duvar_b', 'labirent_duvar_c', 'labirent_dugum_a', 'labirent_dugum_b', 'labirent_yol_a', 'labirent_yol_b'], { budget: 12_000 }),
  // Nomad mushroom-picker camp.
  ...list('spor-ormani/kamp/glb/', ['kamp_cadir'], { budget: 120_000 }),
  ...list('spor-ormani/kamp/glb/', ['kamp_ates', 'kurutma_cerceve', 'kurutma_tepsi', 'mantar_dizisi', 'sepet_sirt', 'sepet_grubu', 'kamp_tezgah', 'kamp_araba', 'kamp_oturak', 'kamp_fener', 'kamp_kupler'], { budget: 20_000 }),
  // Rocks, cut blocks, floating rocks, lamps and small props.
  ...list('spor-ormani/tas/glb/', ['tas_orta', 'tas_buyuk', 'tas_yassi', 'tas_dikili', 'tas_kaya', 'tas_dengeli', 'tas_yarik', 'tas_grup', 'tas_kemer'], { budget: 25_000 }),
  // The first exports of these two came out empty; re-exported from their .blend files.
  ...list('spor-ormani/tas/glb-onarim/', ['tas_cakil', 'tas_sivri'], { budget: 25_000 }),
  ...list('spor-ormani/tas/glb/', ['blok_kesme', 'blok_yikik_duvar'], { budget: 25_000 }),
  ...list('spor-ormani/tas/glb/', ['ucan_blok_kucuk', 'ucan_blok_orta', 'ucan_ada', 'ucan_kaya', 'ucan_basamak', 'ucan_ikiz', 'ucan_sivri', 'ucan_harabe'], { budget: 30_000 }),
  ...list('spor-ormani/tas/glb/', ['lamba_sokak', 'lamba_cift', 'lamba_bahce', 'kasa', 'fici', 'sepet_mantar', 'kutuk', 'cit', 'odun_yigini', 'kavanoz_ates'], { budget: 12_000 }),
  // `tabela` is already a kit kind (neon sign): this one ships as tabela_ahsap.
  { name: 'tabela_ahsap', src: 'spor-ormani/tas/glb/tabela.glb', budget: 12_000 },
  // Interior furniture and decor (interior designer).
  ...list('spor-ormani/ic-esya/glb/', [
    'mantar_masa', 'mantar_tabure', 'kok_sandik', 'mantar_raf', 'spor_kavanoz', 'kabuk_yatak', 'spor_fener', 'kavisli_kitaplik',
    'gaudi_sandalye', 'gaudi_kanepe', 'gaudi_ayna', 'mozaik_saksi', 'gaudi_avize', 'mozaik_masa', 'spiral_hali',
    'askilik', 'ayakli_saat', 'calisma_masasi', 'cikrik', 'erzak_cuvali', 'gaudi_berjer', 'gaudi_dolap', 'gaudi_komodin', 'gaudi_lambader',
    'gaudi_soba', 'gaudi_somine', 'gaudi_yatak', 'hasir_kilim', 'kabuk_masa', 'kazan', 'kok_yemek_masasi', 'kurutma_askisi', 'kutuk_bank',
    'kutuk_koltuk', 'kutuk_tezgah', 'lavabo', 'mantar_dolap', 'mantar_kanepe', 'mantar_komodin', 'mantar_lambader', 'mantar_ocak',
    'mantar_saksi', 'mum_seti', 'mutfak_tezgahi', 'puf', 'sepet_seti', 'spor_avize', 'su_fici', 'tabak_seti', 'yan_sehpa', 'yemek_masasi',
  ], { budget: 12_000, dir: 'ic' }),
  // Spor Ormanı creatures (rigged: never simplified).
  ...list(P, ['dusman_geyik', 'dusman_salyangoz'], { dir: '../dusman' }),
];
