"use strict";

const passengerFlow = (() => {
  const {gates, floor, terminalPaths, baggageClaim} = airport;
  const {queueRows, queueSpacing, bridgePath, boardingPath, loungeSeats, sharedSeats, cafeSeats, cafeDoorX, airsideExit, concourseRight, restroomStalls,
    security: securityLayout} = terminalPaths;
  const pace = 4.1;
  const entranceZ = 29;
  const corridorZ = 27.77;
  const cafeCorridorZ = 17.7;
  const boardingSpacing = .64;
  const scanTime = .43;
  const checkInTime = .95;
  const screeningTime = .75;
  const deplaneInterval = .32;
  const point = (x, z) => [x, floor, z];
  const claimEntrance = point(baggageClaim.entranceX, baggageClaim.entranceZ);
  const arrivalsConcourse = point(airsideExit.x, baggageClaim.entranceZ);
  const arrivalExitPath = [point(airsideExit.x, airsideExit.thresholdZ),
    [airsideExit.x, .04, airsideExit.z], [airsideExit.x, .04, 31.6]];

  function manifest(capacity, arrivalStart, arrivalEnd, lateTimes = []) {
    const people = [];
    const regular = capacity - lateTimes.length;
    for (let i = 0; i < capacity; i++) {
      const person = makePerson(i, "outside");
      if (i < regular) {
        const fraction = (i + .2 + (i * 7 % 13) / 20) / regular;
        person.arrivalAt = arrivalStart + (arrivalEnd - arrivalStart) * fraction;
      } else {
        person.lateArrival = true;
        person.arrivalAt = lateTimes[i - regular];
      }
      people.push(person);
    }
    return people;
  }

  function makePerson(index, zone) {
    return {index, zone, position: null, angle: Math.PI, distance: 0, moving: false, route: null};
  }

  function serviceFinishAt(now, person, duration) {
    return now + duration + person.index % 4 * .12;
  }

  function create() {
    function banks(layout) {
      return layout.banks.map(({id, x, desks}, index) => ({
        id, x, front: layout.front, cursor: 0, service: null, status: index ? "closed" : "open", desks,
        lines: [-.36, -.12, .12, .36].map(offset => ({x: x + offset * layout.width, people: []}))
      }));
    }
    const flow = {
      checkIn: banks(terminalPaths.checkIn),
      security: banks(securityLayout),
      boarding: gates.map(({x}, gate) => ({...makeBoardingLine(x), spots: makeLounge(x, gate)})),
      sharedSeats: sharedSeats.map(spot => ({...spot})),
      cafe: cafeSeats.map(spot => ({...spot})),
      restrooms: restroomStalls.map(stall => ({...stall, owner: null})),
      claimSpots: new Map(baggageClaim.carousels.map(({id, waitingSpots}) =>
        [id, waitingSpots.map(spot => ({...spot}))])),
      claimSeats: baggageClaim.claimSeats.map(spot => ({...spot})),
      claimStanding: baggageClaim.claimStanding.map(spot => ({...spot})),
      exiting: [], arrivals: [],
      nextEntry: 0, entrancesUsed: 0
    };
    flow.guestSeats = flow.boarding.flatMap(queue => queue.spots.seats);
    return flow;
  }

  function queueSpot(bank, line, index) {
    return point(line.x, bank.front + queueSpacing * index);
  }

  function findLine(banks) {
    let best = null;
    let length = queueRows;
    for (const bank of banks) {
      if (bank.status !== "open") continue;
      for (const line of bank.lines) {
        if (line.people.length >= length) continue;
        best = {bank, line};
        length = line.people.length;
      }
    }
    return best;
  }

  function makeLounge(x, gate) {
    const seats = loungeSeats(x).map(spot => ({...spot, gate}));
    const standing = [];
    const clearAreas = [[.4, 8.14, 9.28, 9.77], [.4, 8.14, 10.91, 12.18], [.4, 8.14, 13.42, 14.17],
      [-8.38, -6.11, 11.02, 12.13]];
    let seed = 12503 + x;
    function sample() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    for (let i = 0; i < 16000 && standing.length < 106; i++) {
      const [left, right, near, far] = clearAreas[i % clearAreas.length];
      const dx = left + (right - left) * sample();
      const z = near + (far - near) * sample();
      if (standing.some(({position}) => Math.hypot(position[0] - x - dx, position[2] - z) < .4)) continue;
      standing.push({position: point(x + dx, z), angle: sample() * Math.PI * 2,
        aisleX: x + (dx < 0 ? -9.15 : 9.16), seated: false});
    }
    return {seats, standing};
  }

  function reserve(person, spots, stride) {
    const start = person.index * stride % spots.length;
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[(start + i) % spots.length];
      if (spot.owner) continue;
      spot.owner = person;
      person.spot = spot;
      return spot;
    }
    return null;
  }

  function reserveLounge(person, queue) {
    const prefersSeat = person.index * 19 % 11 < 7;
    return (prefersSeat && reserve(person, queue.spots.seats, 7)) ||
      reserve(person, queue.spots.standing, 37) || reserve(person, queue.spots.seats, 7);
  }

  function settle(person) {
    person.seated = person.spot.seated;
    person.angle = person.spot.angle;
  }

  function leaveSpot(person) {
    const spot = person.spot;
    if (spot) {
      spot.owner = null;
      person.spot = null;
      person.seated = false;
    }
    return spot;
  }

  function gateBy(person, flight) {
    return flight.boardingAt - 4 - person.index * 43 % 34;
  }

  function startRestroomVisit(person, flow, now, returnBy = Infinity) {
    const stall = flow.restrooms.find(({owner}) => !owner);
    if (!stall) return false;
    const {approach, entryPath, position} = stall;
    const path = [point(person.position[0], approach[2]), approach, ...entryPath, position];
    const exit = [...entryPath].reverse().concat([approach]);
    const duration = 3.2 + person.index % 4 * .8;
    const returnAt = now + travelTime(person.position, path) + duration + travelTime(position, exit);
    if (returnAt > returnBy) return false;
    stall.owner = person;
    person.restroomVisit = {stall, exit, duration, leaveAt: null, leaving: false};
    person.zone = "restroom";
    walk(person, path);
    return true;
  }

  function releaseRestroom(person) {
    if (!person.restroomVisit) return;
    person.restroomVisit.stall.owner = null;
    delete person.restroomVisit;
  }

  function advanceRestroomVisit(person, now, dt) {
    const visit = person.restroomVisit;
    follow(person, dt);
    if (person.route) return false;
    if (visit.leaving) {
      releaseRestroom(person);
      return true;
    }
    visit.leaveAt ??= now + visit.duration;
    if (now >= visit.leaveAt) {
      visit.leaving = true;
      walk(person, visit.exit);
    }
    return false;
  }

  function cafeExit(spot) {
    return [point(spot.position[0], spot.aisleZ), point(cafeDoorX, spot.aisleZ),
      point(cafeDoorX, cafeCorridorZ)];
  }

  function reserveCafe(person, flight, flow, now) {
    const spot = reserve(person, flow.cafe, 3);
    if (spot) person.cafeUntil = flight.gate === null ? now + 22 + person.index % 13 : Infinity;
    return spot;
  }

  function cafeLeaveAt(person, flight) {
    if (flight.gate === null) return person.cafeUntil;
    const spot = person.spot;
    const walkBack = travelTime(spot.position, cafeExit(spot)) + (Math.abs(gates[flight.gate].x - cafeDoorX) + 11) / pace;
    return Math.min(person.cafeUntil, gateBy(person, flight) - walkBack);
  }

  function strollPath(person, destinationX) {
    const [x] = person.position;
    const z = 16.25 + person.index % 5 * .45;
    const turnX = x > 12 || (x >= -12 && person.index % 2) ? -25 + person.index % 7
      : Math.min(27, concourseRight) - 7 + person.index % 8;
    return [point(x, z), point(turnX, z), point(turnX, z + .55), point((turnX + destinationX) / 2, z + .55)];
  }

  function afterSecurity(person, flight, flow, now) {
    if (flight.stage !== "boarding") {
      const gate = gates[flight.gate];
      const preference = person.index * 11 % 19;
      const [x] = person.position;
      if (preference < 6 && flow.restrooms.length) {
        const [approachX] = flow.restrooms[0].approach;
        const walkToGate = gate ? (Math.abs(approachX - gate.x) + 12) / pace : 0;
        if (startRestroomVisit(person, flow, now, gateBy(person, flight) - walkToGate)) return;
      }
      if (preference < 8) {
        const spot = reserveCafe(person, flight, flow, now);
        if (spot) {
          const path = [point(x, cafeCorridorZ), ...cafeExit(spot).reverse(), spot.position];
          if (now + travelTime(person.position, path) + 3 < cafeLeaveAt(person, flight)) {
            walk(person, path, "cafe");
            return;
          }
          leaveSpot(person);
          person.cafeUntil = undefined;
        }
      }
      if (preference < 14) {
        const path = strollPath(person, gate?.x ?? x);
        const returnAt = gate ? gateBy(person, flight) - (Math.abs(path.at(-1)[0] - gate.x) + 10) / pace : Infinity;
        if (now + travelTime(person.position, path) < returnAt) {
          person.strollUntil = returnAt;
          walk(person, path);
          return;
        }
      }
    }
    goToGateOrWait(person, flight, flow, now);
  }

  function goToGateOrWait(person, flight, flow, now) {
    const queue = flow.boarding[flight.gate];
    if (queue && walkToGate(person, flight, queue, now)) return;
    const spot = reserve(person, flow.sharedSeats, 7) || reserve(person, flow.guestSeats, 7);
    if (spot) {
      walkToSeat(person, spot, spot.gate === undefined ? "sharedSeats" : "otherGate");
    } else {
      person.strollUntil = Infinity;
      walk(person, strollPath(person, person.position[0]));
    }
  }

  function recallWaitingSeat(person, flight, flow, now) {
    if (person.route || flight.gate === null || (person.zone !== "sharedSeats" && person.zone !== "otherGate")) return false;
    const spot = person.spot;
    if (spot.gate === flight.gate) {
      person.zone = "gate";
      return true;
    }
    const walkBack = (Math.abs(spot.aisleX - gates[flight.gate].x) + 14) / pace;
    if (flight.stage !== "boarding" && now < gateBy(person, flight) - walkBack) return false;
    const queue = flow.boarding[flight.gate];
    const hasLoungeSpace = queue.spots.seats.some(seat => !seat.owner) || queue.spots.standing.some(place => !place.owner);
    if (!hasLoungeSpace && !(wantsToQueue(person, flight, now) && hasRoom(queue))) return false;
    const row = seatAisle(spot);
    leaveSpot(person);
    person.zone = "concourse";
    walk(person, [point(person.position[0], row), point(spot.aisleX, row), point(spot.aisleX, 16.1)], "concourse");
    return true;
  }

  function recallActivities(person, flight, flow, now) {
    const boarding = flight.stage === "boarding";
    if (person.strollUntil !== undefined && (!person.route ||
      (person.strollUntil < Infinity && (boarding || now >= person.strollUntil)))) {
      person.strollUntil = undefined;
      goToGateOrWait(person, flight, flow, now);
    }
    if (person.cafeUntil === undefined || (!boarding && now < cafeLeaveAt(person, flight))) return false;

    const seatedAtCafe = person.zone === "cafe";
    const spot = leaveSpot(person);
    const route = person.route;
    person.cafeUntil = undefined;
    person.zone = "concourse";
    if (seatedAtCafe || route?.index >= 3) {
      const exit = seatedAtCafe ? cafeExit(spot) : route.points.slice(1, route.index).reverse();
      walk(person, exit, "concourse");
    } else {
      goToGateOrWait(person, flight, flow, now);
    }
    return seatedAtCafe;
  }

  function follow(person, dt) {
    const route = person.route;
    if (!route) return false;
    let budget = dt * pace;
    while (route.index < route.points.length && budget > 0) {
      const remaining = stepToward(person, route.points[route.index], budget);
      if (remaining < 0) return false;
      budget = remaining;
      route.index++;
    }
    if (route.index < route.points.length) return false;
    person.route = null;
    const previousZone = person.zone;
    if (route.zone) person.zone = route.zone;
    if (person.spot && route.points.at(-1) === person.spot.position) settle(person);
    return previousZone !== person.zone;
  }

  // Return the distance left for the next waypoint, or -1 while still walking to this one.
  function stepToward(person, target, budget) {
    const [x, y, z] = person.position;
    const dx = target[0] - x, dy = target[1] - y, dz = target[2] - z;
    const distance = Math.hypot(dx, dy, dz);
    if (!distance || !budget) return distance ? -1 : budget;
    const step = Math.min(distance, budget);
    const ratio = step / distance;
    person.position = ratio === 1 ? target : [x + dx * ratio, y + dy * ratio, z + dz * ratio];
    person.angle = Math.atan2(dx, dz);
    person.distance += step;
    person.moving = true;
    return ratio === 1 ? budget - step : -1;
  }

  function walk(person, points, zone, startAt = -Infinity) {
    person.route = {points, index: 0, zone, startAt};
  }

  function walkToGate(person, flight, queue, now) {
    const [startX] = person.position;
    const middleZ = 16.1 + person.index % 5 * .48;
    if (wantsToQueue(person, flight, now) && hasRoom(queue)) {
      const {position, offset} = boardingEntry(queue);
      const points = [point(startX, middleZ), point(position[0], middleZ), position];
      approachLine(person, queue, {points, offset, duration: travelTime(person.position, points)}, now);
    } else {
      const spot = reserveLounge(person, queue);
      if (!spot) return false;
      walkToSeat(person, spot, "gate");
    }
    return true;
  }

  function walkToSeat(person, spot, zone) {
    const [x] = spot.position;
    const middleZ = 16.1 + person.index % 5 * .48;
    const row = seatAisle(spot);
    walk(person, [point(person.position[0], middleZ), point(spot.aisleX, middleZ),
      point(spot.aisleX, row), point(x, row), spot.position], zone);
  }

  function seatAisle(spot) {
    return spot.position[2] + (spot.seated ? Math.cos(spot.angle) * .58 : 0);
  }

  function lengthBetween(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  function travelTime(start, points) {
    return points.reduce((length, next, i) => length + lengthBetween(i ? points[i - 1] : start, next), 0) / pace;
  }

  function makeBoardingLine(x) {
    const points = boardingPath(x);
    const offsets = [0];
    for (let i = 1; i < points.length; i++) offsets.push(offsets[i - 1] + lengthBetween(points[i - 1], points[i]));
    const length = offsets.at(-1);
    return {points, offsets, length, capacity: Math.floor(length / boardingSpacing),
      line: [], approaching: [], scanUntil: null, nextJoin: 0, nextCall: 0};
  }

  function positionOnLine(queue, offset) {
    const end = queue.offsets.findIndex((distance, i) => i > 0 && distance >= offset);
    const start = end - 1;
    const t = (offset - queue.offsets[start]) / (queue.offsets[end] - queue.offsets[start]);
    return queue.points[start].map((value, i) => value + (queue.points[end][i] - value) * t);
  }

  function hasRoom(queue) {
    return queue.line.length + queue.approaching.length < queue.capacity && queue.approaching.length < 10;
  }

  function wantsToQueue(person, flight, now) {
    if (flight.stage === "boarding") return true;
    const queuesEarly = person.index * 7 % 13 < 4;
    const leadTime = 6 + person.index * 5 % 11;
    return flight.stage === "parked" && queuesEarly && now >= flight.boardingAt - leadTime;
  }

  function boardingEntry(queue) {
    const tailOffset = queue.line.at(-1)?.offset ?? -boardingSpacing;
    const joinOffset = tailOffset + (queue.approaching.length + 1) * boardingSpacing;
    const fullEntranceInUse = queue.approaching.at(-1)?.offset === queue.length;
    // The open end of the first lane lets passengers join behind a short line without crossing a rail.
    if (!fullEntranceInUse && joinOffset <= queue.offsets[1]) {
      return {position: queue.points[1], offset: queue.offsets[1]};
    }
    return {position: queue.points.at(-1), offset: queue.length};
  }

  function approachLine(person, queue, {points, offset, duration}, now) {
    const joinAt = Math.max(now + duration, queue.nextJoin);
    queue.nextJoin = joinAt + .31;
    walk(person, points, undefined, joinAt - duration);
    queue.approaching.push({person, offset});
  }

  function callFromLounge(flight, queue, now) {
    if (!hasRoom(queue) || now < queue.nextCall) return;
    const waiting = flight.manifest.filter(person => person.zone === "gate" && !person.route &&
      !queue.approaching.some(entry => entry.person === person) && wantsToQueue(person, flight, now));
    if (!waiting.length) return;

    const person = waiting[Math.floor(Math.random() * waiting.length)];
    const {position, offset} = boardingEntry(queue);
    const row = seatAisle(person.spot);
    const aisleX = person.spot.aisleX;
    const points = [point(person.position[0], row), point(aisleX, row)];
    if (aisleX !== position[0]) points.push(point(aisleX, 15.36), point(position[0], 15.36));
    points.push(position);
    approachLine(person, queue, {points, offset, duration: travelTime(person.position, points)}, now + .13);
    queue.nextCall = now + .25;
  }

  function advanceGateQueue(flight, queue, now, dt) {
    let changed = false;
    for (const [index, entry] of queue.line.entries()) {
      const ahead = index ? queue.line[index - 1].offset + boardingSpacing : 0;
      const distance = Math.min(dt * pace, entry.offset - ahead);
      if (distance <= 0) continue;
      entry.offset -= distance;
      const next = positionOnLine(queue, entry.offset);
      const {person} = entry;
      person.angle = Math.atan2(next[0] - person.position[0], next[2] - person.position[2]);
      person.position = next;
      person.distance += distance;
      person.moving = true;
    }
    const head = queue.line[0];
    if (flight.stage === "boarding" && head?.offset === 0) {
      queue.scanUntil ??= now + scanTime;
      if (now >= queue.scanUntil) {
        const {person} = queue.line.shift();
        person.zone = "boarding";
        walk(person, bridgePath(gates[flight.gate].x), "boarded");
        queue.scanUntil = null;
        changed = true;
      }
    }
    const tail = queue.line.at(-1);
    const next = queue.approaching[0];
    if (next && !next.person.route && (!tail || next.offset - tail.offset >= boardingSpacing)) {
      queue.approaching.shift();
      next.person.zone = "gateQueue";
      queue.line.push(next);
      changed = true;
    }
    callFromLounge(flight, queue, now);
    return changed;
  }

  function openCounter(flow, zone) {
    const banks = flow[zone];
    const reopening = banks.find(bank => bank.status === "closing");
    const newBank = reopening ?? banks.find(bank => bank.status === "closed");
    if (!newBank) return null;
    newBank.status = "open";
    const open = banks.filter(bank => bank.status === "open").map(bank => ({
      bank, waiting: bank.lines.reduce((total, line) => total + line.people.length, 0)
    }));
    while (true) {
      open.sort((a, b) => a.waiting - b.waiting);
      const shortest = open[0];
      const longest = open.at(-1);
      if (longest.waiting - shortest.waiting <= 1) break;

      const {lines, cursor} = longest.bank;
      let source = lines[cursor];
      for (let offset = 1; offset < lines.length; offset++) {
        const line = lines[(cursor + offset) % lines.length];
        if (line.people.length >= source.people.length) source = line;
      }
      const {line: destination} = findLine([shortest.bank]);
      const person = source.people.pop();
      destination.people.push(person);
      longest.waiting--;
      shortest.waiting++;

      // Preserve the approach to the corridor when redirecting someone already on their way.
      const waypoints = person.route
        ? person.route.points.slice(person.route.index, -1)
        : [point(person.position[0], corridorZ)];
      person.zone = "landside";
      walk(person, [...waypoints, point(destination.x, corridorZ)], zone);
    }
    return newBank;
  }

  function counterOccupied(bank) {
    return bank.service || bank.lines.some(line => line.people.length);
  }

  function closeCounter(flow, zone) {
    const opened = flow[zone].filter(bank => bank.status === "open");
    if (opened.length < 2) return null;
    const bank = opened.at(-1);
    bank.status = counterOccupied(bank) ? "closing" : "closed";
    return bank;
  }

  function nextPassenger(flights, now) {
    let next = null;
    for (const flight of flights) {
      const person = flight.manifest.find(item => item.zone === "outside");
      if (person && person.arrivalAt <= now && (!next || person.arrivalAt < next.arrivalAt)) next = person;
    }
    return next;
  }

  function exitPath(person, queue) {
    const {zone, spot, route, position: [x, , z]} = person;
    if (zone === "checkIn" || zone === "landside" || (zone === "security" && z >= securityLayout.checkpointZ)) {
      return [point(x, corridorZ), point(0, corridorZ), point(0, entranceZ + .6)];
    }
    const toExit = [claimEntrance, arrivalsConcourse, ...arrivalExitPath];
    if (zone === "cafe") return [...cafeExit(spot), ...toExit];
    if (person.restroomVisit) {
      const {exit, leaving} = person.restroomVisit;
      const waypoints = route
        ? leaving ? route.points.slice(route.index) : route.points.slice(0, route.index).reverse()
        : exit;
      return [...waypoints, ...toExit];
    }

    const path = [];
    if (zone === "gateQueue") {
      const {offset} = queue.line.find(entry => entry.person === person);
      if (offset <= queue.offsets[1]) {
        path.push(queue.points[1]);
      } else {
        const next = queue.offsets.findIndex(distance => distance > offset);
        if (next >= 0) path.push(...queue.points.slice(next));
      }
    } else if (spot && (zone === "gate" || zone === "otherGate" || zone === "sharedSeats")) {
      const row = seatAisle(spot);
      path.push(point(x, row), point(spot.aisleX, row));
    } else if (zone === "concourse" && route?.zone === "concourse") {
      path.push(...route.points.slice(route.index));
    } else if (spot && route?.index > 1) {
      path.push(...route.points.slice(0, route.index).reverse());
    }
    const [aisleX] = path.at(-1) ?? person.position;
    path.push(point(aisleX, cafeCorridorZ), ...toExit);
    return path;
  }

  function closeBoarding(flight, flow) {
    const missed = new Set(flight.manifest.filter(person => person.zone !== "boarding" && person.zone !== "boarded"));
    const queue = flow.boarding[flight.gate];
    for (const person of missed) {
      delete person.securityBag;
      if (person.position) {
        const path = exitPath(person, queue);
        leaveSpot(person);
        releaseRestroom(person);
        walk(person, path);
        flow.exiting.push({person, flight});
      }
      person.zone = "missed";
    }
    for (const bank of [...flow.checkIn, ...flow.security]) {
      if (bank.service && missed.has(bank.service.person)) bank.service = null;
      for (const line of bank.lines) line.people = line.people.filter(person => !missed.has(person));
    }
    queue.line = [];
    queue.approaching = [];
    queue.scanUntil = null;
    queue.nextJoin = 0;
    queue.nextCall = 0;
    return missed.size;
  }

  function startDeplaning(flight, now, arrivalBags) {
    const {x} = gates[flight.gate];
    const bridge = bridgePath(x).reverse();
    const [doorX] = bridge.at(-1);
    const aisleX = x - 9.35;
    const path = [...bridge.slice(1), point(doorX, 8.62), point(aisleX, 8.62),
      point(aisleX, baggageClaim.entranceZ), claimEntrance, arrivalsConcourse];
    flight.deplaning = {remaining: flight.incomingPassengers, onBridge: 0, nextAt: now + .65,
      door: bridge[0], bridgeWaypoints: bridge.length - 1, path, arrivalBags};
  }

  function claimAisle(spot) {
    return spot ? [point(spot.position[0], spot.aisleZ), point(airsideExit.x, spot.aisleZ)] : [];
  }

  function exitClaim(person) {
    const spot = leaveSpot(person);
    person.arrivalBag = null;
    walk(person, [...claimAisle(spot), ...arrivalExitPath]);
  }

  function advancePickup(person, flow) {
    const bag = person.arrivalBag;
    const waiting = person.spot;
    if (bag.cancelled) {
      exitClaim(person);
      return;
    }
    if (!waiting?.pickup) {
      const {carousel} = bag.flight;
      if (carousel !== null) {
        const spot = reserve(person, flow.claimSpots.get(carousel), 37);
        if (!spot) return;
        if (waiting) waiting.owner = null;
        person.seated = false;
        walk(person, [...claimAisle(waiting), point(airsideExit.x, spot.aisleZ),
          point(spot.position[0], spot.aisleZ), spot.position]);
      } else if (!waiting) {
        const spot = (person.index % 2 === 0 && reserve(person, flow.claimSeats, 7)) ||
          reserve(person, flow.claimStanding, 37) || reserve(person, flow.claimSeats, 7);
        if (!spot) return;
        walk(person, [point(airsideExit.x, spot.aisleZ), point(spot.position[0], spot.aisleZ), spot.position]);
      }
      return;
    }
    const {pickup, angle} = waiting;
    const pose = bag.claimPose;
    person.angle = angle;
    if (!pose) return;
    const distance = Math.hypot(pose.x - pickup[0], pose.z - pickup[2]);
    if (person.position !== pickup) {
      if (distance < 2) walk(person, [pickup]);
      return;
    }
    if (distance >= .86) return;
    person.claimedBag = bag.color;
    bag.claimed = true;
    exitClaim(person);
  }

  function advanceArrivals(flights, flow, now, dt, onDeplaned) {
    let changed = false;
    for (let i = flow.arrivals.length - 1; i >= 0; i--) {
      const {person, flight} = flow.arrivals[i];
      const arrival = flight.deplaning;
      person.moving = false;
      if (person.restroomVisit) {
        const {resume} = person.restroomVisit;
        if (advanceRestroomVisit(person, now, dt)) {
          person.zone = "arrivalsExit";
          walk(person, resume);
          changed = true;
        }
        continue;
      }
      follow(person, dt);
      if (person.zone === "deplaning" && (!person.route || person.route.index >= arrival.bridgeWaypoints)) {
        person.zone = "arrivalsExit";
        arrival.onBridge--;
        if (arrival.remaining === 0 && arrival.onBridge === 0) onDeplaned(flight);
        changed = true;
      }
      if (person.zone === "arrivalsExit" && person.index * 5 % 17 < 5 &&
          person.route?.index === arrival.path.length - 2) {
        const resume = person.route.points.slice(person.route.index);
        if (startRestroomVisit(person, flow, now)) {
          person.restroomVisit.resume = resume;
          changed = true;
          continue;
        }
      }
      if (!person.route && person.arrivalBag) {
        const bag = person.arrivalBag;
        if (!bag.cancelled) bag.claimWaitAt ??= now;
        advancePickup(person, flow);
      }
      if (!person.route && !person.arrivalBag) {
        flow.arrivals.splice(i, 1);
        changed = true;
      }
    }
    for (const flight of flights) {
      if (flight.stage !== "deplaning") continue;
      const arrival = flight.deplaning;
      if (!arrival.remaining || now < arrival.nextAt) continue;
      const index = flight.incomingPassengers - arrival.remaining;
      const person = makePerson(flight.passengers + index, "deplaning");
      person.position = arrival.door;
      const bag = arrival.arrivalBags?.get(index);
      person.arrivalBag = bag && !bag.cancelled ? bag : null;
      walk(person, person.arrivalBag ? arrival.path : [...arrival.path, ...arrivalExitPath]);
      flow.arrivals.push({person, flight});
      arrival.remaining--;
      arrival.onBridge++;
      arrival.nextAt = now + deplaneInterval;
      changed = true;
    }
    return changed;
  }

  function advance(flights, flow, now, dt, onReady, onDeplaned, onCheckedIn) {
    let changed = advanceArrivals(flights, flow, now, dt, onDeplaned);
    for (let i = flow.exiting.length - 1; i >= 0; i--) {
      const {person} = flow.exiting[i];
      person.moving = false;
      follow(person, dt);
      if (!person.route) {
        flow.exiting.splice(i, 1);
        changed = true;
      }
    }
    for (const flight of flights) {
      for (const person of flight.manifest) {
        if (person.zone === "missed" || person.zone === "outside" || person.zone === "boarded") continue;
        person.moving = false;
        if (person.restroomVisit) {
          if (advanceRestroomVisit(person, now, dt)) {
            person.zone = "concourse";
            goToGateOrWait(person, flight, flow, now);
            changed = true;
          }
          continue;
        }
        if (person.cafeUntil !== undefined || person.strollUntil !== undefined) {
          changed = recallActivities(person, flight, flow, now) || changed;
        }
        changed = recallWaitingSeat(person, flight, flow, now) || changed;
        const previousZone = person.zone;
        const wasWalking = person.route;
        const walkStart = wasWalking?.startAt ?? -Infinity;
        const walkTime = Math.min(dt, Math.max(0, now - walkStart));
        if (wasWalking && walkTime > 0 && person.zone === "gate") leaveSpot(person);
        changed = follow(person, walkTime) || changed;
        if (wasWalking?.zone === "concourse" && !person.route) {
          if (previousZone === "security") {
            delete person.securityBag;
            afterSecurity(person, flight, flow, now);
          } else {
            goToGateOrWait(person, flight, flow, now);
          }
        }
      }
    }
    function useCounter(banks, duration, approach, release) {
      for (const bank of banks) {
        if (bank.status === "closed") continue;
        bank.lines.forEach(line => {
          line.people.forEach((person, index) => {
            if (!person.route && !person.moving) stepToward(person, queueSpot(bank, line, index), dt * pace);
          });
        });
        const service = bank.service;
        if (service) {
          if (service.person.route) continue;
          if (service.finishesAt === null) {
            service.finishesAt = serviceFinishAt(now, service.person, duration);
            changed = true;
          }
          if (now < service.finishesAt || !release(service.person, bank)) continue;
          bank.service = null;
          changed = true;
        }
        for (let i = 0; i < bank.lines.length; i++) {
          const lane = (bank.cursor + i) % bank.lines.length;
          const line = bank.lines[lane];
          const person = line.people[0];
          if (!person || person.route || person.position[2] !== bank.front) continue;
          approach(person, bank);
          line.people.shift();
          bank.cursor = (lane + 1) % bank.lines.length;
          bank.service = {person, finishesAt: null};
          break;
        }
        if (bank.status === "closing" && !counterOccupied(bank)) {
          bank.status = "closed";
          changed = true;
        }
      }
    }

    useCounter(flow.security, screeningTime, (person, bank) => {
      const exitX = bank.x + securityLayout.portalOffsetX;
      const [x] = person.position;
      const approachZ = bank.front - .19;
      const path = [point(x, approachZ), point(exitX, approachZ), point(exitX, securityLayout.checkpointZ + .55)];
      person.securityBag = {from: airport.carryOnPosition(person), beltX: bank.x + securityLayout.belt.offsetX,
        startAt: now, placedAt: now + .42, scannedAt: serviceFinishAt(now + travelTime(person.position, path), person, screeningTime),
        pickupAt: Infinity};
      walk(person, path);
    }, (person, bank) => {
      const exitX = bank.x + securityLayout.portalOffsetX;
      const bag = person.securityBag;
      const path = [point(exitX, securityLayout.checkpointZ - .48), point(bag.beltX + .9, securityLayout.exitZ)];
      bag.pickupAt = now + travelTime(person.position, path);
      walk(person, path, "concourse");
      return true;
    });
    const deskFrontZ = terminalPaths.checkIn.deskZ + .57;
    useCounter(flow.checkIn, checkInTime, (person, bank) => {
      const [x] = person.position;
      const deskX = bank.desks[x < bank.x ? 0 : bank.desks.length - 1];
      walk(person, [point(x, deskFrontZ), point(deskX, deskFrontZ)]);
    }, (person, bank) => {
      const queue = findLine(flow.security);
      if (!queue) return false;
      onCheckedIn?.(person);
      const sideX = bank.x - terminalPaths.checkIn.width / 2 - .35;
      person.zone = "landside";
      queue.line.people.push(person);
      walk(person, [point(sideX, deskFrontZ),
        point(sideX, corridorZ), point(queue.line.x, corridorZ)], "security");
      return true;
    });

    if (now >= flow.nextEntry) {
      const person = nextPassenger(flights, now);
      const queue = person && findLine(flow.checkIn);
      if (queue) {
        const entranceX = -6 + flow.entrancesUsed++ % 4 * 4;
        person.position = point(entranceX, entranceZ);
        person.zone = "checkIn";
        queue.line.people.push(person);
        walk(person, [point(entranceX, corridorZ), point(queue.line.x, corridorZ)]);
        flow.nextEntry = now + .17;
        changed = true;
      }
    }

    for (const flight of flights) {
      if (flight.stage === "parked" || flight.stage === "boarding") {
        changed = advanceGateQueue(flight, flow.boarding[flight.gate], now, dt) || changed;
      }
      if ((flight.stage === "boarding" || flight.stage === "closing") &&
        flight.manifest.every(person => person.zone === "boarded" || person.zone === "missed")) onReady(flight);
    }
    return changed;
  }

  function snapshot(flights, flow) {
    const people = {
      checkIn: [], landside: [], security: [], concourse: [], cafe: [], restroom: [], sharedSeats: [], boarding: [],
      deplaning: [], arrivalsExit: [], exiting: [...flow.exiting], visible: [...flow.exiting, ...flow.arrivals],
      gates: gates.map(() => [])
    };
    for (const entry of flow.arrivals) people[entry.person.zone].push(entry);
    const byFlight = new Map();
    for (const flight of flights) {
      const counts = {outside: 0, checkIn: 0, landside: 0, security: 0, concourse: 0, cafe: 0, restroom: 0,
        sharedSeats: 0, otherGate: 0, gate: 0, gateQueue: 0, boarding: 0, boarded: 0, missed: 0,
        regularUnboarded: 0, lateOutside: 0, lateInTerminal: 0};
      byFlight.set(flight.id, counts);
      for (const person of flight.manifest) {
        counts[person.zone]++;
        if (person.lateArrival) {
          if (person.zone === "outside") {
            counts.lateOutside++;
          } else if (!["boarding", "boarded", "missed"].includes(person.zone)) {
            counts.lateInTerminal++;
          }
        } else if (person.zone !== "boarded") {
          counts.regularUnboarded++;
        }
        if (person.zone === "boarded" || person.zone === "outside" || person.zone === "missed") continue;
        const entry = {person, flight};
        const atGate = person.zone === "gate" || person.zone === "gateQueue";
        const gate = person.zone === "otherGate" ? person.spot.gate : atGate ? flight.gate : null;
        const section = gate === null ? people[person.zone] : people.gates[gate];
        section.push(entry);
        people.visible.push(entry);
      }
    }
    const processing = {
      checkIn: flow.checkIn.filter(bank => bank.service?.finishesAt != null).length,
      security: flow.security.filter(bank => bank.service?.finishesAt != null).length
    };
    return {...people, byFlight, processing, total: people.visible.length};
  }

  return {manifest, create, openCounter, closeCounter, startDeplaning, closeBoarding, advance, snapshot};
})();
