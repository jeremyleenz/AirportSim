"use strict";

const passengerFlow = (() => {
  const {gates, floor, terminalPaths} = airport;
  const {queueRows, queueSpacing, bridgePath} = terminalPaths;
  const pace = 4.1;
  const entranceZ = 29;
  const corridorZ = 27.77;
  const loungeRows = [9.35, 9.74, 10.79, 11.32, 11.86, 13.47, 14.05];
  const loungeColumns = 18;
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
      nextEntry: 0, entrancesUsed: 0, openedLanes: lanes
    };
    for (const flight of flights) {
      for (const person of flight.manifest) {
        if (person.zone === "gate") person.position = loungeSpot(person, flight);
        if (person.zone === "checkIn" || person.zone === "security") {
          const selected = findLine(flow[person.zone], person.zone === "security" ? lanes : 3);
          person.position = queueSpot(selected.bank, selected.line, selected.line.people.length);
          selected.line.people.push(person);
        }
        if (person.zone === "concourse") {
          const exit = terminalPaths.security.centers[person.index % lanes] + 1.05;
          person.position = point(exit, 19.10);
          walkToGate(person, flight);
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
    const x = gates[flight.gate].x + ((loungeColumns - 1) / 2 - slot % loungeColumns) * .82;
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

  function walk(person, points, zone) {
    person.route = {points, index: 0, zone};
  }

  function walkToGate(person, flight) {
    const [startX] = person.position;
    const [seatX, , seatZ] = loungeSpot(person, flight);
    const aisleX = gates[flight.gate].x + 6.55;
    const middleZ = 16.1 + person.index % 5 * .48;
    walk(person, [point(startX, middleZ), point(aisleX, middleZ), point(aisleX, seatZ),
      point(seatX, seatZ)], "gate");
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
        changed = follow(person, dt) || changed;
        if (wasWalking?.zone === "concourse" && !person.route) {
          walkToGate(person, flight);
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
      if (now >= flight.nextBoarding) {
        const person = flight.manifest.find(item => item.zone === "gate");
        if (person) {
          const gateX = gates[flight.gate].x;
          const aisleX = gateX + 6.55;
          const [, , seatZ] = person.position;
          const bridge = bridgePath(gateX);
          person.zone = "boarding";
          walk(person, [point(aisleX, seatZ), point(aisleX, 8.78), point(bridge[0][0], 8.78),
            ...bridge], "boarded");
          flight.nextBoarding = now + .23;
          changed = true;
        }
      }
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
      const counts = {outside: 0, checkIn: 0, security: 0, concourse: 0, gate: 0, boarding: 0, boarded: 0};
      byFlight.set(flight.id, counts);
      for (const person of flight.manifest) {
        counts[person.zone]++;
        if (person.zone === "boarded" || person.zone === "outside") continue;
        const entry = {person, flight};
        const section = person.zone === "gate" ? people.gates[flight.gate] : people[person.zone];
        section.push(entry);
        people.visible.push(entry);
      }
    }
    return {...people, byFlight, total: people.visible.length};
  }

  return {manifest, create, advance, snapshot};
})();
