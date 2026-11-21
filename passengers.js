"use strict";

const passengerFlow = (() => {
  const {gates, floor, terminalPaths} = airport;
  const {queueRows, queueSpacing, bridgePath, boardingPath} = terminalPaths;
  const pace = 4.1;
  const entranceZ = 29;
  const corridorZ = 27.77;
  const loungeRows = [9.35, 9.74, 10.79, 11.32, 11.86, 13.47, 14.05];
  const loungeColumns = 16;
  const boardingSpacing = .64;
  const scanTime = .43;
  const point = (x, z) => [x, floor, z];

  function manifest(capacity, initial = {}, remainder = "outside") {
    const people = [];
    for (const [zone, count] of Object.entries(initial)) {
      for (let i = 0; i < count; i++) people.push(makePerson(people.length, zone));
    }
    while (people.length < capacity) people.push(makePerson(people.length, remainder));
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
      boarding: gates.map(({x}) => makeBoardingLine(x)),
      nextEntry: 0, entrancesUsed: 0, openedLanes: lanes
    };
    for (const flight of flights) {
      for (const person of flight.manifest) {
        if (person.zone === "gate") person.position = loungeSpot(person, flight);
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
          walkToGate(person, flight, flow.boarding[flight.gate], 0);
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

  function loungeSpot(person, flight) {
    const slot = person.index * 37 % (loungeColumns * loungeRows.length);
    const x = gates[flight.gate].x + .42 + slot % loungeColumns * .51;
    return point(x, loungeRows[Math.floor(slot / loungeColumns)]);
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
    const [aisleX] = entry;
    const middleZ = 16.1 + person.index % 5 * .48;
    const approach = [point(startX, middleZ), point(aisleX, middleZ)];
    if (flight.stage === "boarding" && hasRoom(queue)) {
      approach.push(entry);
      approachLine(person, queue, approach, travelTime(person.position, approach), now);
    } else {
      const [seatX, , seatZ] = loungeSpot(person, flight);
      walk(person, [...approach, point(aisleX, seatZ), point(seatX, seatZ)], "gate");
    }
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
      if (person.zone !== "gate" || person.route || queue.approaching.includes(person)) continue;
      const points = [point(entry[0], person.position[2]), entry];
      const duration = travelTime(person.position, points);
      const arrival = duration + (person.index * 7 % 9) * .055;
      if (!first || arrival < first.arrival) first = {person, points, duration, arrival};
    }
    if (first) {
      approachLine(first.person, queue, first.points, first.duration, now + .13);
      queue.nextCall = now + .25;
    }
  }

  function advanceBoarding(flight, queue, now, dt) {
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
    if (head?.offset === 0) {
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

  function advance(flights, flow, now, dt, lanes, onReady) {
    let changed = false;
    for (const flight of flights) {
      for (const person of flight.manifest) {
        person.moving = false;
        const wasWalking = person.route;
        const walkStart = wasWalking?.startAt ?? -Infinity;
        changed = follow(person, Math.min(dt, Math.max(0, now - walkStart))) || changed;
        if (wasWalking?.zone === "concourse" && !person.route) {
          walkToGate(person, flight, flow.boarding[flight.gate], now);
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
      const person = flights.flatMap(flight => flight.manifest).find(item => item.zone === "outside");
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
      if (flight.stage !== "boarding") continue;
      changed = advanceBoarding(flight, flow.boarding[flight.gate], now, dt) || changed;
      if (flight.manifest.every(person => person.zone === "boarded")) onReady(flight);
    }
    return changed;
  }

  function snapshot(flights) {
    const people = {
      checkIn: [], security: [], concourse: [], boarding: [], visible: [],
      gates: gates.map(() => [])
    };
    const byFlight = new Map();
    for (const flight of flights) {
      const counts = {outside: 0, checkIn: 0, security: 0, concourse: 0, gate: 0, gateQueue: 0, boarding: 0, boarded: 0};
      byFlight.set(flight.id, counts);
      for (const person of flight.manifest) {
        counts[person.zone]++;
        if (person.zone === "boarded" || person.zone === "outside") continue;
        const entry = {person, flight};
        const atGate = person.zone === "gate" || person.zone === "gateQueue";
        const section = atGate ? people.gates[flight.gate] : people[person.zone];
        section.push(entry);
        people.visible.push(entry);
      }
    }
    return {...people, byFlight, total: people.visible.length};
  }

  return {manifest, create, advance, snapshot};
})();
