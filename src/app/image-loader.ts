import { S, stime } from "@thegraid/common-lib";

/** Simple async Image loader [from ImageReveal.loadImage()]
 *
 * see also: createjs.ImageLoader, which we don't use.
 */
export class ImageLoader {
  /**
   * Promise to load url as HTMLImageElement
   */
  loadImage(url: string): Promise<HTMLImageElement> {
    //console.log(stime(`image-loader: try loadImage`), url)
    return new Promise((res, rej) => {
      const img: HTMLImageElement = new Image();
      img.onload = (evt => res(img));
      img.onerror = ((err) => rej(`failed to load ${url} -> ${err}`));
      img.src = url; // start loading
    });
  }

  /**
   * load all imageUrls, then invoke callback(images: HTMLImageElement[])
   * @param imageUrls
   * @param cb
   */
  loadImages(imageUrls: string[], cb: (images: HTMLImageElement[]) => void) {
    let promises = imageUrls.map(url => this.loadImage(url));
    Promise.all(promises).then((values) => cb(values), (reason) => {
      console.error(stime(this, `.loadImages:`), reason);
    })
  }

  constructor(args: { root: string, fnames: string[], ext: string },
    imap = new Map<string, HTMLImageElement>(),
    cb?: (imap: Map<string, HTMLImageElement>) => void)
  {
    let { root, fnames, ext } = args
    let paths = fnames.map(fn => `${root}${fn}.${ext}`)
    this.loadImages(paths, (images: HTMLImageElement[]) => {
      fnames.forEach((fn, n) => {
        images[n][S.Aname] = fn;
        imap.set(fn, images[n])
      })
      if (cb) cb(imap)
    })
  }
}
