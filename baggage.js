"use strict";

const baggage = (() => {
  const beltSpeed = 5;
  const tugSpeed = 7;
  const bagsPerTrailer = 6;
  const batchSize = 2 * bagsPerTrailer;
  const batchWait = 3.5;
  const trailerSpacing = 2.18;
  const loaderBeltSpeed = 2.2;
  const loaderTravelTime = 1.1;
  const loaderStandby = .75;
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
    return {items: [], trip: null, loaders: loaderRoutes.map(() => ({docked: 0, stayUntil: 0, running: false, offset: 0}))};
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
    const x = (index % 2 - .5) * .48;
    const z = (Math.floor(index / 2) - 1) * .49;
    const c = Math.cos(pose.angle), s = Math.sin(pose.angle);
    return [pose.x + x * c + z * s, .42, pose.z - x * s + z * c];
  }

  function checkedIn(animation, flight, person, now) {
    if (person.index * 37 % 100 >= 58) return;
    animation.items.push({flight, person, path: timedPath(airport.luggageFromDesk(person.position[0]), now, beltSpeed), loading: false});
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

  function advance(animation, now, dt) {
    const items = animation.items;
    for (let i = items.length - 1; i >= 0; i--) {
      if (!isActive(items[i], now)) items.splice(i, 1);
    }
    if (animation.trip && now >= animation.trip.finish) animation.trip = null;
    if (!animation.trip) dispatch(animation, now);

    for (const loader of animation.loaders) loader.running = false;
    for (const bag of items) {
      if (!bag.loading || now < bag.path[0].time - 1.5) continue;
      const loader = animation.loaders[bag.flight.gate];
      loader.stayUntil = now + loaderStandby;
      if (now >= bag.path.at(-2).time) loader.running = true;
    }
    for (const loader of animation.loaders) {
      const delta = (now < loader.stayUntil ? dt : -dt) / loaderTravelTime;
      loader.docked = Math.max(0, Math.min(1, loader.docked + delta));
      if (loader.running) loader.offset = (loader.offset + dt * .88) % 1;
    }
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
    const time = trip ? Math.min(now - trip.start, trip.arrival) + Math.max(0, now - trip.returnAt) : 0;
    moving.push({mesh: meshes.tug, ...poseOnPath(path, time)});
    const trailers = [0, 1].map(index => trailerPose(path, time, index));
    for (const trailer of trailers) moving.push({mesh: meshes.trailer, ...trailer});
    trip?.bags.forEach((bag, index) => {
      if (!isActive(bag, now) || now >= bag.path[0].time) return;
      const trailer = trailers[Math.floor(index / bagsPerTrailer)];
      const [x, y, z] = bagSlot(trailer, index % bagsPerTrailer);
      moving.push({mesh: suitcases[bag.person.index % suitcases.length], x, y, z, angle: trailer.angle, castShadow: false});
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
    return moving;
  }

  return {create, checkedIn, advance, actors};
})();
