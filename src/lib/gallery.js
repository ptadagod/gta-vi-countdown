/**
 * Official GTA VI Launch Gallery images, referenced directly from
 * https://www.rockstargames.com/VI/launch-gallery (paths taken from that page).
 * Rockstar's image CDN supports `imwidth` for responsive sizes.
 */
const BASE = 'https://www.rockstargames.com/VI/_next/static/media/';

/** Official Grand Theft Auto VI logo (transparent PNG, 807×540) from the same page. */
export const LOGO_URL = `${BASE}vi.0hxa9~pf214xe.png`;

const RAW = [
  ['Vice_City_15.11tb0mz68edqo.jpg', 'Vice City'],
  ['Jason_and_Lucia_14.10e7v.06pcm_t.jpg', 'Jason & Lucia'],
  ['Vice_City_13.0iq8ff474tsdx.jpg', 'Vice City'],
  ['Jason_and_Lucia_15.0m-_zb~mcy2zr.jpg', 'Jason & Lucia'],
  ['Lucia_Caminos_11.0j617-ylicowx.jpg', 'Lucia Caminos'],
  ['Vice_City_16.16hjjmnxqg9mv.jpg', 'Vice City'],
  ['Jason_Duval_11.019l5gj6~0~0v.jpg', 'Jason Duval'],
  ['Port_Gellhorn_07.053ldlg0m.2r..jpg', 'Port Gellhorn'],
  ['Jason_and_Lucia_16.05-d133mx68ku.jpg', 'Jason & Lucia'],
  ['Vice_City_18.001ebutl6h-9w.jpg', 'Vice City'],
  ['Leonida_Keys_07.0z9tb69ssp4rq.jpg', 'Leonida Keys'],
  ['Lucia_Caminos_12.0saq9ns-~xj03.jpg', 'Lucia Caminos'],
  ['Vice_City_20.18c75478u52nf.jpg', 'Vice City'],
  ['Grassrivers_07.0txitddjiq5o1.jpg', 'Grassrivers'],
  ['Jason_and_Lucia_17.117_b11r13mg5.jpg', 'Jason & Lucia'],
  ['Vice_City_22.0--9jlb822n~g.jpg', 'Vice City'],
  ['Jason_Duval_13.0xtzlmp0y6mt-.jpg', 'Jason Duval'],
  ['Vice_City_24.0r9tor5-x.p75.jpg', 'Vice City'],
  ['Lucia_Caminos_13.08dd3_zn0g59u.jpg', 'Lucia Caminos'],
  ['Grassrivers_08.0x-z0h-he35zo.jpg', 'Grassrivers'],
  ['Jason_and_Lucia_20.0cd~.c7jr~5g9.jpg', 'Jason & Lucia'],
  ['Vice_City_27.0d2e~w_r93hmh.jpg', 'Vice City'],
];

const toImages = (list) =>
  list.map(([file, caption], i) => ({
    id: i,
    caption,
    src: (width) => `${BASE}${file}?akim=1&imdensity=1&imwidth=${width}`,
  }));

/** Widescreen images: desktop, laptop, landscape tablets and phones. */
export const GALLERY = toImages(RAW);

/**
 * Portrait images for upright phones and tablets. These are Rockstar's own
 * mobile crops: the launch gallery's Jason & Lucia mobile image, plus the
 * portrait images from the main GTA VI page (https://www.rockstargames.com/VI).
 */
export const MOBILE_GALLERY = toImages([
  ['mobile.0mi46.hy2kwfa.jpg', 'Vice City'],
  ['mobile.0xsc-b1pnezup.jpg', 'Jason & Lucia'],
  ['Jason_and_Lucia_14_Mobile.17zv0lmevzbgs.jpg', 'Jason & Lucia'],
  ['musicMobile.16pdg34v6lit..jpg', 'Jason & Lucia · Artwork'],
  ['screenshotsMobile.01nsldjqbta4u.jpg', 'Jason & Lucia'],
  ['mediaMobile.0p_yfitphljim.jpg', 'Jason & Lucia'],
  ['onlyInLeonidaMobile.0mupfnk-x6x~r.jpg', 'Only in Leonida'],
]);

/** Which screens get the portrait set. */
export const PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 1100px)';

/** Pick a CDN width appropriate for the current viewport. */
export function preferredWidth() {
  const w = (window.screen?.width || window.innerWidth) * (window.devicePixelRatio || 1);
  const sizes = [1280, 1920, 2560, 3840];
  return sizes.find((s) => s >= w) || 3840;
}
