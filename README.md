# Airport Ops

An isometric airport operations game. It runs in a browser with WebGL 2, with no backend or account required for players.

See the [expansion roadmap](ROADMAP.md) for the planned progression, airport improvements, and airline contracts.

## Saved progress

The game saves your shift in this browser as you play, when you pause, and when you leave the tab. Reopening restores the saved time, passengers, aircraft, and treasury. If you paused before leaving, the shift stays paused. Between shifts, reopening brings back the shift report and your plans for the next day. The next shift begins when you choose **Start Day**.

To start over, open **Operations → Terminal** and choose **Reset progress** at the bottom. Confirming starts Day 1 and removes the current run and its upgrades.

Between shifts, open **Airport upgrades** to buy a second baggage carousel, a third security lane, a third check-in desk, or Gate A03. You can buy several upgrades if the treasury covers them. The confirmation screen previews where each upgrade will go. The game saves the purchase and location together with the updated treasury. Purchased facilities are available the next morning.

Open **Airline contracts** between shifts to sign or end routes to Christchurch, Canberra, the Gold Coast, Sydney, and Queenstown. Christchurch and Sydney each add one daily turnaround. Canberra, the Gold Coast, and Queenstown each add two. Sydney arrives at 14:35 during the afternoon peak, and Queenstown adds late-morning and early-afternoon traffic. With all five signed, the schedule has 20 daily departures. Contract changes start the next morning.

The base timetable cycles through a standard day, a lunchtime rush, and a late-afternoon rush. Use **Tomorrow’s schedule** between shifts to see the next day’s flight times. Open it from a contract to preview how that route fits before signing.

With one baggage carousel, arriving flights get it automatically in arrival order. Once you install a second carousel, you choose one for each flight.

Baggage service credits cost $10 per passenger-minute after the first five minutes spent waiting for a free or assigned carousel once the bag is ready. The total is visible in Baggage claim during the shift and in the shift report. The report also counts passengers who waited over 25 minutes in total for their bags.

The shift ends after all departures, overnight arrivals, and baggage claims are resolved. At the 19:00 curfew, the shift ends and the report shows any baggage claims still open.

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
