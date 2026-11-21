# Airport Ops

An isometric airport operations game. It runs in a browser with WebGL 2, with no backend or account required for players.

## Package for deployment

Run `make package` from the repository to copy the game to `dist/` and create `airport-sim.zip`. The ZIP has `index.html` at its root and contains all the files needed to play. Rerun the command after changes to make a new package.

## Publish and share

Serve the contents of `dist/` from a static web host. For a public link using Cloudflare Pages, choose **Direct Upload**, upload `airport-sim.zip`, and deploy. Share the `pages.dev` URL that Cloudflare assigns. [Cloudflare Pages Direct Upload guide](https://developers.cloudflare.com/pages/get-started/direct-upload/)

## Preview locally

```sh
make build
python3 -m http.server --bind 127.0.0.1 --directory dist 8000
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in a browser.
