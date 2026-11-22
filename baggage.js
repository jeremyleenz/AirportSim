"use strict";

const baggage = (() => {
  const beltSpeed = 5;
  const tugSpeed = 7;
  const bagsPerTrailer = 6;
  const inboundBagsPerTrailer = 3 * bagsPerTrailer;
  const firstInboundLoad = 10;
  const batchSize = 2 * bagsPerTrailer;
  const batchWait = 3.5;
  const trailerSpacing = 2.18;
  const loaderBeltSpeed = 2.2;
  const loaderTravelTime = 1.1;
  const loaderStandby = .75;
  const claimSpeed = 2.5;
  const {carousels} = airport.baggageClaim;
  const claimLoops = carousels.map(({loop}) => timedPath(loop, 0, claimSpeed));
  const atGate = new Set(["deplaning", "parked", "boarding", "closing", "ready"]);
  const loaderRoutes = airport.gates.map((_, gate) => {
    const [transfer, , foot, hatch] = airport.luggageToAircraft(gate);
    const dx = hatch[0] - foot[0], dz = hatch[2] - foot[2];
    return {transfer, foot, hatch, dx, dz, angle: Math.atan2(dx, dz), length: Math.hypot(dx, dz)};
  });
  const tugRoutes = loaderRoutes.map(({transfer, foot}) => {
    const [sortingX, , returnZ] = transfer;
    const z = returnZ - 1.25;
    const x = foot[0] - 1.05;
    const depot = [sortingX - 2.7, 0, z];
    return timedPath([depot, [x, 0, z], [x - 2.1, 0, z], [x - 3.25, 0, z + .68],
      [x - 2.1, 0, returnZ], [sortingX + 1.1, 0, returnZ], [sortingX + 2, 0, z + .75],
      [sortingX + 1.9, 0, z], depot], 0, tugSpeed);
  });

  function create() {
    return {items: [], arrivals: [], claimBags: [], nextFeedAt: 0, trip: null,
      loaders: loaderRoutes.map(() => ({docked: 0, stayUntil: 0, direction: 0, offset: 0}))};
  }

  function timedPath(points, start, speed, finalSpeed = speed) {
    const path = [{point: points[0], time: start}];
    for (let i = 1; i < points.length; i++) {
      const [x, y, z] = points[i];
      const [oldX, oldY, oldZ] = points[i - 1];
      const duration = Math.hypot(x - oldX, y - oldY, z - oldZ) / (i === points.length - 1 ? finalSpeed : speed);
      path.push({point: points[i], time: path.at(-1).time + duration});
    }
    return path;
  }

  function poseOnPath(path, now) {
    const next = path.findIndex(waypoint => waypoint.time > now);
    const index = next < 0 ? path.length - 1 : Math.max(1, next);
    const {point: [x, y, z], time} = path[index - 1];
    const {point: [toX, toY, toZ], time: end} = path[index];
    const t = Math.min(1, (now - time) / (end - time));
    return {x: x + (toX - x) * t, y: y + (toY - y) * t, z: z + (toZ - z) * t,
      angle: Math.atan2(toX - x, toZ - z)};
  }

  function trailerPose(path, time, trailer) {
    return poseOnPath(path, time - (trailer + 1) * trailerSpacing / tugSpeed);
  }

  function bagSlot(pose, index) {
    const slot = index % bagsPerTrailer;
    const x = (slot % 2 - .5) * .48;
    const y = .42 + Math.floor(index / bagsPerTrailer) * .34;
    const z = (Math.floor(slot / 2) - 1) * .52;
    const c = Math.cos(pose.angle), s = Math.sin(pose.angle);
    return [pose.x + x * c + z * s, y, pose.z - x * s + z * c];
  }

  function checkedIn(animation, flight, person, now) {
    if (person.index * 37 % 100 >= 58) return;
    animation.items.push({flight, person, path: timedPath(airport.luggageFromDesk(person.position[0]), now, beltSpeed), loading: false});
  }

  function arrived(animation, flight) {
    const count = Math.round(flight.incomingPassengers * (.55 + Math.random() * .1));
    const carousel = flight.gate;
    const colors = airport.baggageColors.length;
    const indices = Array.from({length: flight.incomingPassengers}, (_, index) => index);
    const byPassenger = new Map();
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (indices.length - i));
      [indices[i], indices[j]] = [indices[j], indices[i]];
      byPassenger.set(indices[i], {color: Math.floor(Math.random() * colors), carousel});
    }
    if (count) animation.arrivals.push({flight, bags: [...byPassenger.values()], firstTrip: true});
    return byPassenger;
  }

  function isActive(bag, now) {
    return bag.person.zone !== "missed" && bag.flight.stage !== "outbound" &&
      (!bag.loading || now < bag.path.at(-1).time);
  }

  function dispatch(animation, now) {
    const waiting = animation.items.filter(bag => !bag.loading &&
      now >= bag.path.at(-1).time && atGate.has(bag.flight.stage));
    const first = waiting[0];
    if (!first) return;
    const bags = waiting.filter(bag => bag.flight === first.flight).slice(0, batchSize);
    if (bags.length < batchSize && now < first.path.at(-1).time + batchWait) return;

    const {gate} = first.flight;
    const route = tugRoutes[gate];
    const arrival = route[1].time;
    const {foot, hatch} = loaderRoutes[gate];
    bags.forEach((bag, index) => {
      const trailer = trailerPose(route, arrival, Math.floor(index / bagsPerTrailer));
      const handoff = now + arrival + .35 + index * .27;
      bag.path = timedPath([bagSlot(trailer, index % bagsPerTrailer), foot, hatch], handoff, 4.5, loaderBeltSpeed);
      bag.loading = true;
    });
    const returnAt = bags.at(-1).path[0].time + .6;
    animation.trip = {bags, route, start: now, arrival, returnAt, finish: returnAt + route.at(-1).time - arrival};
  }

  function collect(animation, flight, bags, now) {
    const {gate} = flight;
    const route = tugRoutes[gate];
    const arrival = route[1].time;
    const {transfer, foot, hatch} = loaderRoutes[gate];
    bags.forEach((bag, index) => {
      const trailer = trailerPose(route, arrival, Math.floor(index / inboundBagsPerTrailer));
      const slot = bagSlot(trailer, index % inboundBagsPerTrailer);
      bag.loadPath = timedPath([hatch, foot, slot], now + arrival + .35 + index * .31, loaderBeltSpeed, 4.5);
    });
    const returnAt = Math.max(...bags.map(bag => bag.loadPath.at(-1).time)) + .35;
    const depotTime = route[5].time;
    const depotAt = returnAt + depotTime - arrival;
    let leaveDepotAt = depotAt;
    // Unload the top of each stack before moving the cases underneath it.
    for (let index = bags.length - 1; index >= 0; index--) {
      const bag = bags[index];
      const trailer = trailerPose(route, depotTime, Math.floor(index / inboundBagsPerTrailer));
      const slot = bagSlot(trailer, index % inboundBagsPerTrailer);
      const unloadAt = depotAt + (bags.length - 1 - index) * .37;
      bag.transferPath = timedPath([slot, transfer], unloadAt, 4.5);
      leaveDepotAt = Math.max(leaveDepotAt, bag.transferPath.at(-1).time + .28);
      const feedAt = Math.max(bag.transferPath.at(-1).time + 2.6, animation.nextFeedAt);
      bag.feedPath = timedPath(carousels[gate].feed, feedAt, claimSpeed);
      animation.nextFeedAt = feedAt + .37;
      animation.claimBags.push(bag);
    }
    animation.trip = {flight, bags, route, start: now, arrival, returnAt, depotAt, leaveDepotAt,
      finish: leaveDepotAt + route.at(-1).time - depotTime};
  }

  function advanceClaim(animation, now) {
    animation.claimBags = animation.claimBags.filter(bag => !bag.claimed && !bag.cancelled);
    for (const bag of animation.claimBags) {
      const sinceFeed = now - bag.feedPath.at(-1).time;
      if (sinceFeed < 0) continue;
      if (sinceFeed > 55) {
        bag.cancelled = true;
        continue;
      }
      const loop = claimLoops[bag.carousel];
      bag.claimPose = poseOnPath(loop, sinceFeed % loop.at(-1).time);
    }
  }

  function advance(animation, now, dt) {
    const items = animation.items;
    for (let i = items.length - 1; i >= 0; i--) {
      if (!isActive(items[i], now)) items.splice(i, 1);
    }
    if (animation.trip && now >= animation.trip.finish) animation.trip = null;
    for (let i = animation.arrivals.length - 1; i >= 0; i--) {
      const arrival = animation.arrivals[i];
      if (atGate.has(arrival.flight.stage)) continue;
      for (const bag of arrival.bags) bag.cancelled = true;
      animation.arrivals.splice(i, 1);
    }
    if (!animation.trip) {
      // Get the first bags onto each carousel before coming back for the rest.
      const next = animation.arrivals.findIndex(arrival => arrival.firstTrip);
      const [arrival] = animation.arrivals.splice(Math.max(0, next), 1);
      if (arrival) {
        const capacity = arrival.firstTrip ? firstInboundLoad : 2 * inboundBagsPerTrailer;
        const bags = arrival.bags.splice(0, capacity);
        collect(animation, arrival.flight, bags, now);
        if (arrival.bags.length) {
          arrival.firstTrip = false;
          animation.arrivals.push(arrival);
        }
      } else {
        dispatch(animation, now);
      }
    }

    for (const loader of animation.loaders) loader.direction = 0;
    const trip = animation.trip;
    if (trip?.flight) {
      const loader = animation.loaders[trip.flight.gate];
      for (const bag of trip.bags) {
        const [hatch, foot] = bag.loadPath;
        if (!atGate.has(trip.flight.stage) && now < foot.time) bag.cancelled = true;
        if (bag.cancelled || now < hatch.time - 1.5 || now >= foot.time) continue;
        loader.stayUntil = now + loaderStandby;
        if (now >= hatch.time) loader.direction = -1;
      }
    }
    for (const bag of items) {
      if (!bag.loading || now < bag.path[0].time - 1.5) continue;
      const loader = animation.loaders[bag.flight.gate];
      loader.stayUntil = now + loaderStandby;
      if (now >= bag.path.at(-2).time) loader.direction = 1;
    }
    for (const loader of animation.loaders) {
      const delta = (now < loader.stayUntil ? dt : -dt) / loaderTravelTime;
      loader.docked = Math.max(0, Math.min(1, loader.docked + delta));
      loader.offset = (1 + loader.offset + dt * .88 * loader.direction) % 1;
    }
    advanceClaim(animation, now);
  }

  function drawLoaders(animation, meshes, moving) {
    for (const [gate, loader] of animation.loaders.entries()) {
      const {foot, hatch, dx, dz, length, angle} = loaderRoutes[gate];
      const ease = loader.docked * loader.docked * (3 - 2 * loader.docked);
      const retreat = 3.6 * (1 - ease) / length;
      const x = foot[0] - dx * retreat, z = foot[2] - dz * retreat;
      moving.push({mesh: meshes.truck, x, z, angle});
      for (let i = 0; i < 8; i++) {
        const t = (i / 8 + loader.offset) % 1;
        moving.push({mesh: meshes.roller, x: x + dx * t, y: foot[1] + (hatch[1] - foot[1]) * t - .01,
          z: z + dz * t, angle, castShadow: false});
      }
    }
  }

  function drawTrain(trip, meshes, suitcases, now, moving) {
    const path = trip?.route ?? tugRoutes[0];
    let time = 0;
    if (trip) {
      time = Math.min(now - trip.start, trip.arrival) + Math.max(0, now - trip.returnAt);
      if (trip.flight) time -= Math.max(0, Math.min(now, trip.leaveDepotAt) - trip.depotAt);
    }
    moving.push({mesh: meshes.tug, ...poseOnPath(path, time)});
    const trailers = [0, 1].map(index => trailerPose(path, time, index));
    for (const trailer of trailers) moving.push({mesh: meshes.trailer, ...trailer});
    const capacity = trip?.flight ? inboundBagsPerTrailer : bagsPerTrailer;
    trip?.bags.forEach((bag, index) => {
      const onTrailer = trip.flight
        ? !bag.cancelled && now >= bag.loadPath.at(-1).time && now < bag.transferPath[0].time
        : isActive(bag, now) && now < bag.path[0].time;
      if (!onTrailer) return;
      const trailer = trailers[Math.floor(index / capacity)];
      const [x, y, z] = bagSlot(trailer, index % capacity);
      const color = trip.flight ? bag.color : bag.person.index % suitcases.length;
      moving.push({mesh: suitcases[color], x, y, z, angle: trailer.angle, castShadow: false});
    });
  }

  function actors(animation, suitcases, loaders, train, now) {
    const moving = [];
    drawLoaders(animation, loaders, moving);
    drawTrain(animation.trip, train, suitcases, now, moving);
    for (const bag of animation.items) {
      if (!isActive(bag, now) || now < bag.path[0].time || now >= bag.path.at(-1).time) continue;
      moving.push({mesh: suitcases[bag.person.index % suitcases.length], ...poseOnPath(bag.path, now), castShadow: false});
    }
    for (const bag of animation.claimBags) {
      if (bag.cancelled || bag.claimed) continue;
      const path = [bag.loadPath, bag.transferPath, bag.feedPath]
        .find(path => now >= path[0].time && now < path.at(-1).time);
      const pose = path ? poseOnPath(path, now) : bag.claimPose;
      if (pose) moving.push({mesh: suitcases[bag.color], ...pose, castShadow: false});
    }
    return moving;
  }

  return {create, checkedIn, arrived, advance, actors};
})();
