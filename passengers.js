"use strict";

const passengerFlow = (() => {
  const {gates, floor, terminalPaths} = airport;
  const {queueRows, queueSpacing, bridgePath, boardingPath, loungeSeats, sharedSeats, cafeSeats} = terminalPaths;
  const pace = 4.1;
  const entranceZ = 29;
  const corridorZ = 27.77;
  const cafeDoorX = -14.48;
  const cafeCorridorZ = 17.7;
  const boardingSpacing = .64;
  const scanTime = .43;
  const point = (x, z) => [x, floor, z];

  function manifest(capacity, initial, arrivalStart, arrivalEnd) {
    const people = [];
    for (const [zone, count] of Object.entries(initial ?? {})) {
      for (let i = 0; i < count; i++) people.push(makePerson(people.length, zone));
    }
    const outside = capacity - people.length;
    for (let i = 0; i < outside; i++) {
      const person = makePerson(people.length, "outside");
      const fraction = (i + .2 + (i * 7 % 13) / 20) / outside;
      person.arrivalAt = arrivalStart + (arrivalEnd - arrivalStart) * fraction;
      people.push(person);
    }
    return people;
  }

  function makePerson(index, zone) {
    return {index, zone, position: null, angle: Math.PI, distance: 0, moving: false, route: null};
  }

  function create(flights, lanes) {
    function banks(layout) {
      return layout.centers.map(x => ({
        x, front: layout.front, cursor: 0, nextService: 0,
        lines: [-.36, -.12, .12, .36].map(offset => ({x: x + offset * layout.width, people: []}))
      }));
    }
    const flow = {
      checkIn: banks(terminalPaths.checkIn),
      security: banks(terminalPaths.security),
      boarding: gates.map(({x}, gate) => ({...makeBoardingLine(x), spots: makeLounge(x, gate)})),
      sharedSeats: sharedSeats.map(spot => ({...spot})),
      cafe: cafeSeats.map(spot => ({...spot})),
      nextEntry: 0, entrancesUsed: 0, openedLanes: lanes
    };
    flow.guestSeats = flow.boarding.flatMap(queue => queue.spots.seats);
    for (const flight of flights) {
      for (const person of flight.manifest) {
        if (person.zone === "gate" || person.zone === "cafe") {
          const spot = person.zone === "gate"
            ? reserveLounge(person, flow.boarding[flight.gate])
            : reserveCafe(person, flight, flow, 0);
          person.position = spot.position;
          settle(person);
        }
        if (person.zone === "gateQueue") {
          const queue = flow.boarding[flight.gate];
          const offset = queue.line.length * boardingSpacing;
          person.position = positionOnLine(queue, offset);
          queue.line.push({person, offset});
        }
        if (person.zone === "checkIn" || person.zone === "security") {
          const selected = findLine(flow[person.zone], person.zone === "security" ? lanes : 3);
          person.position = queueSpot(selected.bank, selected.line, selected.line.people.length);
          selected.line.people.push(person);
        }
        if (person.zone === "concourse") {
          const exit = terminalPaths.security.centers[person.index % lanes] + 1.05;
          person.position = point(exit, 19.10);
          afterSecurity(person, flight, flow, 0);
          follow(person, (person.index % 12) * .09);
        }
      }
    }
    return flow;
  }

  function queueSpot(bank, line, index) {
    return point(line.x, bank.front + queueSpacing * index);
  }

  function findLine(banks, active) {
    let best = null;
    let length = queueRows;
    for (const bank of banks.slice(0, active)) {
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
    const turnX = x > 12 || (x >= -12 && person.index % 2) ? -25 + person.index % 7 : 20 + person.index % 8;
    return [point(x, z), point(turnX, z), point(turnX, z + .55), point((turnX + destinationX) / 2, z + .55)];
  }

  function afterSecurity(person, flight, flow, now) {
    if (flight.stage !== "boarding") {
      const gate = gates[flight.gate];
      const preference = person.index * 11 % 19;
      const [x] = person.position;
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
    const entry = queue.points.at(-1);
    const middleZ = 16.1 + person.index % 5 * .48;
    if (wantsToQueue(person, flight, now) && hasRoom(queue)) {
      const approach = [point(startX, middleZ), point(entry[0], middleZ), entry];
      approachLine(person, queue, approach, travelTime(person.position, approach), now);
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

  function approachLine(person, queue, points, duration, now) {
    const joinAt = Math.max(now + duration, queue.nextJoin);
    queue.nextJoin = joinAt + .31;
    walk(person, points, undefined, joinAt - duration);
    queue.approaching.push(person);
  }

  function callFromLounge(flight, queue, now) {
    if (!hasRoom(queue) || now < queue.nextCall) return;
    const entry = queue.points.at(-1);
    let first = null;
    for (const person of flight.manifest) {
      if (person.zone !== "gate" || person.route || queue.approaching.includes(person) ||
        !wantsToQueue(person, flight, now)) continue;
      const row = seatAisle(person.spot);
      const aisleX = person.spot.aisleX;
      const points = [point(person.position[0], row), point(aisleX, row)];
      if (aisleX < entry[0]) points.push(point(aisleX, 15.36), point(entry[0], 15.36));
      points.push(entry);
      const duration = travelTime(person.position, points);
      const arrival = duration + (person.index * 7 % 9) * .055;
      if (!first || arrival < first.arrival) first = {person, points, duration, arrival};
    }
    if (first) {
      approachLine(first.person, queue, first.points, first.duration, now + .13);
      queue.nextCall = now + .25;
    }
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
    if (!tail || queue.length - tail.offset >= boardingSpacing) {
      const index = queue.approaching.findIndex(person => !person.route);
      if (index >= 0) {
        const [person] = queue.approaching.splice(index, 1);
        person.zone = "gateQueue";
        queue.line.push({person, offset: queue.length});
        changed = true;
      }
    }
    callFromLounge(flight, queue, now);
    return changed;
  }

  function openSecurityLane(flow, lanes) {
    const newBank = flow.security[lanes - 1];
    let moved = 0;
    for (const bank of flow.security.slice(0, flow.openedLanes)) {
      for (const line of bank.lines) {
        const index = line.people.findLastIndex(person => person.zone === "security" && !person.route);
        if (index < 2) continue;
        const [tail] = line.people.splice(index, 1);
        const destination = newBank.lines[moved++ % newBank.lines.length];
        destination.people.push(tail);
        tail.zone = "concourse";
        walk(tail, [point(line.x, corridorZ), point(destination.x, corridorZ)], "security");
      }
    }
    flow.openedLanes = lanes;
    return moved > 0;
  }

  function nextPassenger(flights, now) {
    let next = null;
    for (const flight of flights) {
      const person = flight.manifest.find(item => item.zone === "outside");
      if (person && person.arrivalAt <= now && (!next || person.arrivalAt < next.arrivalAt)) next = person;
    }
    return next;
  }

  function advance(flights, flow, now, dt, lanes, onReady) {
    let changed = false;
    for (const flight of flights) {
      for (const person of flight.manifest) {
        person.moving = false;
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
          if (previousZone === "security") afterSecurity(person, flight, flow, now);
          else goToGateOrWait(person, flight, flow, now);
        }
      }
    }
    if (lanes > flow.openedLanes) changed = openSecurityLane(flow, lanes) || changed;

    function useCounter(banks, active, interval, serve) {
      for (const bank of banks.slice(0, active)) {
        bank.lines.forEach(line => {
          line.people.forEach((person, index) => {
            if (!person.route && !person.moving) stepToward(person, queueSpot(bank, line, index), dt * pace);
          });
        });
        if (now < bank.nextService) continue;
        for (let i = 0; i < bank.lines.length; i++) {
          const lane = (bank.cursor + i) % bank.lines.length;
          const line = bank.lines[lane];
          const person = line.people[0];
          if (!person || person.route || person.position[2] !== bank.front) continue;
          if (!serve(person, bank)) break;
          line.people.shift();
          bank.cursor = (lane + 1) % bank.lines.length;
          bank.nextService = now + interval;
          changed = true;
          break;
        }
      }
    }

    useCounter(flow.security, lanes, .49, (person, bank) => {
      const exitX = bank.x + 1.05;
      const [x] = person.position;
      walk(person, [point(x, 23.06), point(exitX, 23.06), point(exitX, 19.10)], "concourse");
      return true;
    });
    useCounter(flow.checkIn, 3, .4, (person, bank) => {
      const queue = findLine(flow.security, lanes);
      if (!queue) return false;
      const [x] = person.position;
      const deskX = bank.x + (x < bank.x ? -2.0 : 1.45);
      const sideX = bank.x - 2.85;
      person.zone = "concourse";
      queue.line.people.push(person);
      walk(person, [point(x, 21.52), point(deskX, 21.52), point(sideX, 21.52),
        point(sideX, corridorZ), point(queue.line.x, corridorZ)], "security");
      return true;
    });

    if (now >= flow.nextEntry) {
      const person = nextPassenger(flights, now);
      const queue = person && findLine(flow.checkIn, 3);
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
      if (flight.stage !== "parked" && flight.stage !== "boarding") continue;
      changed = advanceGateQueue(flight, flow.boarding[flight.gate], now, dt) || changed;
      if (flight.stage === "boarding" && flight.manifest.every(person => person.zone === "boarded")) onReady(flight);
    }
    return changed;
  }

  function snapshot(flights) {
    const people = {
      checkIn: [], security: [], concourse: [], cafe: [], sharedSeats: [], boarding: [], visible: [],
      gates: gates.map(() => [])
    };
    const byFlight = new Map();
    for (const flight of flights) {
      const counts = {outside: 0, checkIn: 0, security: 0, concourse: 0, cafe: 0,
        sharedSeats: 0, otherGate: 0, gate: 0, gateQueue: 0, boarding: 0, boarded: 0};
      byFlight.set(flight.id, counts);
      for (const person of flight.manifest) {
        counts[person.zone]++;
        if (person.zone === "boarded" || person.zone === "outside") continue;
        const entry = {person, flight};
        const atGate = person.zone === "gate" || person.zone === "gateQueue";
        const gate = person.zone === "otherGate" ? person.spot.gate : atGate ? flight.gate : null;
        const section = gate === null ? people[person.zone] : people.gates[gate];
        section.push(entry);
        people.visible.push(entry);
      }
    }
    return {...people, byFlight, total: people.visible.length};
  }

  return {manifest, create, advance, snapshot};
})();
