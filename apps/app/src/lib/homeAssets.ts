/**
 * Local editorial product photography for the dashboard — cropped from the
 * supplied asset sheet and bundled (no network). Object cutouts keep their
 * torn-paper edges so they sit on the red/black blocks like collage pieces.
 */
export const homeImages = {
  camera: require('../../assets/home/camera.webp') as number,
  sneakers: require('../../assets/home/sneakers.webp') as number,
  headphones: require('../../assets/home/headphones.webp') as number,
  chair: require('../../assets/home/chair.webp') as number,
  note: require('../../assets/home/note.webp') as number,
  arrow: require('../../assets/home/arrow.webp') as number,
  logo: require('../../assets/home/logo.webp') as number,
  laptop: require('../../assets/home/laptop.webp') as number,
  heroConcrete: require('../../assets/home/hero_concrete.png') as number,
  heroCurve: require('../../assets/home/hero_curve.png') as number,
  /** Full-bleed card backgrounds for the I HAVE / I NEED tiles (generated from the two hero photos). */
  intentHave: require('../../assets/home/intent_have.webp') as number,
  intentNeed: require('../../assets/home/intent_need.webp') as number,
} as const;

/** Category slug → its product tile photograph. Unlisted slugs fall back to an icon. */
export const categoryImage: Record<string, number> = {
  technology: require('../../assets/home/t_tech.webp') as number,
  design: require('../../assets/home/t_design.webp') as number,
  'web-design': require('../../assets/home/t_web.webp') as number,
  photography: require('../../assets/home/t_photo.webp') as number,
  video: require('../../assets/home/t_video.webp') as number,
  writing: require('../../assets/home/t_writing.webp') as number,
  education: require('../../assets/home/t_edu.webp') as number,
};
