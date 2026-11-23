# Airport Ops

An isometric airport operations game. It runs in a browser with WebGL 2, with no backend or account required for players.

See the [expansion roadmap](ROADMAP.md) for the planned progression, airport improvements, and airline contracts.

## Saved progress

At the end of a shift, the game saves the next day, closing treasury, overnight aircraft, and opening schedule to this browser. Reopening starts the simulation at the beginning of the saved day. An unfinished shift restarts from opening.

To start over, open **Operations → Terminal** and choose **Reset progress** at the bottom. Confirming starts Day 1 and removes the current run and its upgrades.

Between shifts, open **Airport upgrades** to buy a second baggage carousel, a third security lane, or a third check-in desk. You can buy several upgrades if the treasury covers them. The confirmation screen previews where each upgrade will go. The game saves the purchase and location together with the updated treasury. Purchased facilities are available the next morning.

With one baggage carousel, arriving flights get it automatically in arrival order. Once you install a second carousel, you choose one for each flight.

## Package for deployment

Run `make package` from the repository to copy the game to `dist/` and create `airport-sim.zip`. The ZIP has `index.html` at its root and contains all the files needed to play. Rerun the command after changes to make a new package.

## Publish and share

Push to `main` to build and publish the game automatically with GitHub Actions. [Play Airport Ops on GitHub Pages](https://jeremyleenz.github.io/AirportSim/)

For manual deployments, serve the contents of `dist/` from a static web host.

## Preview locally

```sh
make build
python3 -m http.server --bind 127.0.0.1 --directory dist 8000
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in a browser.
