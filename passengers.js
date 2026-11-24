"use strict";

function createPassengerFlow(airport) {
  const {gates, floor, terminalPaths, baggageClaim} = airport;
  const {queueRows, queueSpacing, bridgePath, boardingPath, loungeSeats, sharedSeats, cafeSeats, cafeDoorX, airsideExit,
    concourseLeft, concourseRight, restroomStalls, security: securityLayout} = terminalPaths;
  const pace = 4.1;
  const entranceZ = 29;
  const entranceLanes = [-6, -2, 2, 6];
  const corridorZ = 27.77;
  const cafeCorridorZ = 17.7;
  const boardingSpacing = .64;
  const preboardingLeadTime = 34;
  const fullQueueLeadTime = 16;
  const scanTime = .43;
  const checkInTime = .95;
  const screeningTime = .75;
  const deplaneInterval = .32;
  const departureWaitingZones = new Set(["concourse", "cafe", "sharedSeats", "otherGate", "gate"]);
  const point = (x, z) => [x, floor, z];
  const entranceSpots = makeEntranceSpots();
  const claimEntrance = point(baggageClaim.entranceX, baggageClaim.entranceZ);
  const arrivalsConcourse = point(airsideExit.x, baggageClaim.aisleZ);
  const claimAccess = baggageClaim.approachZ === undefined ? [claimEntrance, arrivalsConcourse]
    : [point(baggageClaim.entranceX, baggageClaim.approachZ), claimEntrance, arrivalsConcourse];
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

  function makeRandom(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function makeEntranceSpots() {
    const sample = makeRandom(7919);
    const spots = [];
    const count = 30;
    const spacingSquared = .56 ** 2;
    const left = -11.9, right = Math.min(11.4, concourseRight);
    const stationAreas = [terminalPaths.checkIn, securityLayout].flatMap(({banks, width}) =>
      banks.map(({x}) => ({x, clearance: width / 2 + .36})));
    for (let attempt = 0; attempt < count * 100 && spots.length < count; attempt++) {
      const x = left + (right - left) * sample();
      const z = 27.03 + (28.72 - 27.03) * sample();
      // Keep the walking aisle clear, and use space beside the stations where their queues do not reach.
      const besideStations = z <= corridorZ - .42 && stationAreas.every(area => Math.abs(area.x - x) > area.clearance);
      const alongFrontWall = z >= corridorZ + .42;
      const inTravelLane = Math.abs(x) <= .55 || entranceLanes.some(lane => Math.abs(x - lane) <= .34);
      if ((!besideStations && !alongFrontWall) || inTravelLane ||
          spots.some(({position: [px, , pz]}) => (px - x) ** 2 + (pz - z) ** 2 < spacingSquared)) continue;
      spots.push({position: point(x, z), angle: Math.PI + (sample() - .5) * 2.8, seated: false});
    }
    return spots;
  }

  function create(savedFlow) {
    const leftToRight = (a, b) => a.x - b.x;
    if (savedFlow) {
      savedFlow.checkIn.sort(leftToRight);
      savedFlow.security.sort(leftToRight);
      return savedFlow;
    }

    function banks(layout) {
      return layout.banks.slice().sort(leftToRight).map(({id, x, desks}, index) => ({
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
      entrance: [], entranceSpots: entranceSpots.map(spot => ({...spot})),
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
    // Keep the approaches to both ends of the snake and the walkway extension clear.
    const walkwayEdge = [
      [.36, 8.35, 13.38, 14.17], [-7.55, -5.65, 13.38, 14.17],
      [-8.6, -4.22, 15.02, 15.6], [-3.18, -1.58, 15.15, 15.6], [-.54, 8.35, 15.15, 15.6]
    ];
    const betweenSeats = [[.4, 8.14, 10.99, 12.12], [-8.38, -6.11, 11.02, 12.13]];
    const sample = makeRandom(12503 + x);
    function addStanding(areas, limit) {
      const clearanceSquared = .4 ** 2;
      for (let i = 0; i < 16000 && standing.length < limit; i++) {
        const [left, right, near, far] = areas[i % areas.length];
        const dx = left + (right - left) * sample();
        const standX = x + dx;
        const z = near + (far - near) * sample();
        if (standing.some(({position: [px, , pz]}) => (px - standX) ** 2 + (pz - z) ** 2 < clearanceSquared)) continue;
        const aisleX = z > 15 ? standX : x + (dx < 0 ? -9.15 : 9.16);
        standing.push({position: point(standX, z), angle: sample() * Math.PI * 2, aisleX, seated: false});
      }
    }

    addStanding(walkwayEdge, 110);
    const concourseStanding = standing.slice();
    addStanding(betweenSeats, 110);
    return {seats, standing, concourseStanding};
  }

  function availableSpot(person, spots, stride) {
    const start = person.index * stride % spots.length;
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[(start + i) % spots.length];
      if (!spot.owner) return spot;
    }
    return null;
  }

  function occupySpot(person, spot) {
    spot.owner = person;
    person.spot = spot;
    return spot;
  }

  function reserve(person, spots, stride) {
    const spot = availableSpot(person, spots, stride);
    return spot && occupySpot(person, spot);
  }

  function reserveLounge(person, queue) {
    const {seats, concourseStanding, standing} = queue.spots;
    return reserve(person, seats, 7) || reserve(person, concourseStanding, 37) || reserve(person, standing, 37);
  }

  function fillVacantLoungeSeats(flight, queue, now) {
    if (flight.stage !== "parked") return;
    const lineHasRoom = hasRoom(queue, flight, now);
    for (const seat of queue.spots.seats) {
      if (seat.owner) continue;
      let closest = null;
      let shortestTime = Infinity;
      for (const {owner} of queue.spots.standing) {
        if (!owner || owner.zone !== "gate" || owner.route || (lineHasRoom && wantsToQueue(owner, flight, now))) continue;
        const path = pathToSeat(owner, seat, seatExit(owner));
        const time = travelTime(owner.position, path);
        if (time >= shortestTime) continue;
        closest = {person: owner, path};
        shortestTime = time;
      }
      if (!closest) break;
      const {person, path} = closest;
      leaveSpot(person);
      occupySpot(person, seat);
      walk(person, path, "gate");
    }
  }

  function settle(person) {
    person.seated = person.spot.seated;
    person.angle = person.spot.angle;
    person.moving = false;
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

  function departureActivityDeadline(person, flight, now) {
    // Give boarding a head start before passengers decide they have time for another activity.
    if (flight.gate === null || now >= flight.boardingAt + 12 + person.index % 20) return Infinity;
    return gateBy(person, flight);
  }

  function walkTimeToGate(flight, x) {
    const gate = gates[flight.gate];
    const distance = gate ? Math.abs(x - gate.x) : Math.max(x - concourseLeft, concourseRight - x);
    return (distance + 12) / pace;
  }

  function scheduleRestroomVisit(person, now, minimum, spread) {
    person.restroomAt = now + minimum + (person.index * 53 + Math.floor(now * 11)) % spread;
  }

  function startRestroomVisit(person, flow, now, returnBy = Infinity, access = []) {
    const stall = flow.restrooms.find(({owner}) => !owner);
    if (!stall) return false;
    const {approach, entryPath, position} = stall;
    const [x] = access.at(-1) ?? person.position;
    const path = [...access, point(x, approach[2]), approach, ...entryPath, position];
    const exit = [...entryPath].reverse().concat([approach]);
    const duration = 3.2 + person.index % 4 * .8;
    const returnAt = now + travelTime(person.position, path) + duration + travelTime(position, exit);
    if (returnAt > returnBy) return false;
    stall.owner = person;
    person.restroomVisit = {stall, exit, duration, approachIndex: access.length + 1,
      sits: person.index % 5 !== 0, leaveAt: null, leaving: false};
    delete person.restroomAt;
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
    person.moving = false;
    visit.leaveAt ??= now + visit.duration;
    if (now >= visit.leaveAt) {
      visit.leaving = true;
      if (visit.sits) person.angle = visit.stall.exitAngle ?? 0;
      walk(person, visit.exit);
    }
    return false;
  }

  function cafeExit(spot) {
    return [point(spot.position[0], spot.aisleZ), point(cafeDoorX, spot.aisleZ),
      point(cafeDoorX, cafeCorridorZ)];
  }

  function leaveCafePath(person) {
    if (person.zone === "cafe") return cafeExit(person.spot);
    const {points, index} = person.route;
    const door = points.length - 4;
    return index > door ? points.slice(door, index).reverse() : points.slice(index, door);
  }

  function seatExit(person) {
    const {spot} = person;
    if (!spot) return [];
    const row = seatAisle(spot);
    return [point(person.position[0], row), point(spot.aisleX, row)];
  }

  function useDepartureRestroom(person, flight, flow, now, deadline) {
    if (!(now >= person.restroomAt) || !flow.restrooms.length) return false;
    const access = person.zone === "cafe" ? cafeExit(person.spot) : seatExit(person);
    const [approachX] = flow.restrooms[0].approach;
    if (!startRestroomVisit(person, flow, now, deadline - walkTimeToGate(flight, approachX), access)) return false;
    leaveSpot(person);
    delete person.cafeUntil;
    delete person.strolling;
    delete person.retryGateAt;
    return true;
  }

  function cafeReturnTime(flight, spot) {
    return travelTime(spot.position, cafeExit(spot)) + walkTimeToGate(flight, cafeDoorX);
  }

  function useDepartureCafe(person, flight, flow, now, deadline) {
    if (person.zone === "cafe" || person.index * 11 % 19 >= 8 || now < (person.cafeAt ?? 0)) return false;
    person.cafeAt = now + 12 + person.index % 19;
    if (now >= deadline) return false;
    const spot = availableSpot(person, flow.cafe, 3);
    if (!spot) return false;
    const access = seatExit(person);
    const [x] = access.at(-1) ?? person.position;
    const path = [...access, point(x, cafeCorridorZ), ...cafeExit(spot).reverse(), spot.position];
    const reachedAt = now + travelTime(person.position, path);
    if (reachedAt + 3 >= deadline - cafeReturnTime(flight, spot)) return false;
    leaveSpot(person);
    occupySpot(person, spot);
    person.cafeUntil = reachedAt + 22 + person.index % 13;
    person.cafeAt = person.cafeUntil + 150 + person.index * 17 % 100;
    person.zone = "concourse";
    delete person.strolling;
    delete person.retryGateAt;
    walk(person, path, "cafe");
    return true;
  }

  function startDepartureActivity(person, flight, flow, now) {
    if (person.route || flight.stage === "boarding" || flight.stage === "closing" ||
        !departureWaitingZones.has(person.zone)) return false;
    const deadline = departureActivityDeadline(person, flight, now);
    return useDepartureRestroom(person, flight, flow, now, deadline) || useDepartureCafe(person, flight, flow, now, deadline);
  }

  function startStroll(person) {
    const [x] = person.position;
    const z = 16.25 + person.index % 5 * .45;
    const inset = person.index % 7 * .28;
    const west = concourseLeft + inset, east = concourseRight - inset;
    const trip = person.strollsTaken ?? 0;
    let ends;
    if (person.index % 4 === 0) {
      ends = x <= (west + east) / 2 ? [west, east] : [east, west];
    } else {
      const eastbound = (person.index + trip) % 2 === 0;
      const direction = eastbound ? (east - x >= 8 ? 1 : -1) : (x - west >= 8 ? -1 : 1);
      const distance = 12 + person.index * 7 % 17;
      ends = [Math.max(west, Math.min(east, x + direction * distance))];
    }
    person.strollsTaken = trip + 1;
    person.strolling = true;
    walk(person, [point(x, z), ...ends.map(end => point(end, z))], "concourse");
  }

  function goToGateOrWait(person, flight, flow, now) {
    delete person.strolling;
    delete person.retryGateAt;
    const queue = flow.boarding[flight.gate];
    if (queue) {
      if (!walkToGate(person, flight, queue, now)) {
        person.route = null;
        person.retryGateAt = now + 2 + person.index % 4;
      }
      return;
    }
    const spot = reserve(person, flow.sharedSeats, 7) || reserve(person, flow.guestSeats, 7);
    if (spot) {
      walkToSeat(person, spot, spot.gate === undefined ? "sharedSeats" : "otherGate");
    } else startStroll(person);
  }

  function recallWaitingSeat(person, flight, flow, now) {
    if (person.route || flight.gate === null || (person.zone !== "sharedSeats" && person.zone !== "otherGate")) return false;
    const spot = person.spot;
    if (spot.gate === flight.gate) {
      person.zone = "gate";
      return true;
    }
    const queue = flow.boarding[flight.gate];
    const hasLoungeSpace = queue.spots.seats.some(seat => !seat.owner) || queue.spots.standing.some(place => !place.owner);
    if (!hasLoungeSpace && !(wantsToQueue(person, flight, now) && hasRoom(queue, flight, now))) return false;
    const row = seatAisle(spot);
    leaveSpot(person);
    person.zone = "concourse";
    walk(person, [point(person.position[0], row), point(spot.aisleX, row), point(spot.aisleX, 16.1)], "concourse");
    return true;
  }

  function recallActivities(person, flight, flow, now) {
    if ((person.strolling && flight.gate !== null) || now >= person.retryGateAt) {
      goToGateOrWait(person, flight, flow, now);
    }
    if (person.cafeUntil === undefined) return false;
    const deadline = departureActivityDeadline(person, flight, now) - cafeReturnTime(flight, person.spot);
    if (flight.stage !== "boarding" && now < Math.min(person.cafeUntil, deadline)) return false;

    const exit = leaveCafePath(person);
    leaveSpot(person);
    delete person.cafeUntil;
    person.zone = "concourse";
    if (exit.length) walk(person, exit, "concourse");
    else goToGateOrWait(person, flight, flow, now);
    return true;
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
    if (wantsToQueue(person, flight, now) && hasRoom(queue, flight, now)) {
      const middleZ = boardingWalkwayZ(person);
      const entry = boardingEntry(queue);
      const {offset} = entry;
      const points = [point(startX, middleZ), ...boardingApproach(queue, entry, middleZ)];
      approachLine(person, queue, {points, offset, duration: travelTime(person.position, points)}, now);
    } else {
      fillVacantLoungeSeats(flight, queue, now);
      const spot = reserveLounge(person, queue);
      if (!spot) return false;
      walkToSeat(person, spot, "gate");
    }
    return true;
  }

  function walkToSeat(person, spot, zone) {
    walk(person, pathToSeat(person, spot), zone);
  }

  function pathToSeat(person, spot, exit = []) {
    const [x] = spot.position;
    const middleZ = 16.1 + person.index % 5 * .48;
    const row = seatAisle(spot);
    const approach = [point(spot.aisleX, row), point(x, row), spot.position];
    const [startX] = exit.at(-1) ?? person.position;
    if (exit.length && startX === spot.aisleX) return [...exit, ...approach];
    return [...exit, point(startX, middleZ), point(spot.aisleX, middleZ), ...approach];
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
    return {points, offsets, length, snakeEnd: points.length - 2, capacity: Math.floor(length / boardingSpacing),
      line: [], approaching: [], scanUntil: null, nextJoin: 0, nextCall: 0};
  }

  function positionOnLine(queue, offset) {
    const end = queue.offsets.findIndex((distance, i) => i > 0 && distance >= offset);
    const start = end - 1;
    const t = (offset - queue.offsets[start]) / (queue.offsets[end] - queue.offsets[start]);
    return queue.points[start].map((value, i) => value + (queue.points[end][i] - value) * t);
  }

  function hasRoom(queue, flight, now) {
    const snakeCapacity = Math.floor(queue.offsets[queue.snakeEnd] / boardingSpacing) + 1;
    const queued = queue.line.length + queue.approaching.length;
    if (flight.stage === "boarding") return queued < queue.capacity && queue.approaching.length < 10;
    const fill = Math.max(0, Math.min(1, (now - flight.boardingAt + preboardingLeadTime) / (preboardingLeadTime - fullQueueLeadTime)));
    return queued < Math.ceil(snakeCapacity * fill) && queue.approaching.length < 13;
  }

  function wantsToQueue(person, flight, now) {
    if (flight.stage === "boarding") return true;
    const preference = person.index * 7 % 13;
    if (flight.stage !== "parked" || preference >= 11) return false;
    const leadTime = preference < 4 ? 25 + person.index * 5 % 9
      : preference < 9 ? 18 + person.index * 5 % 8 : 12 + person.index * 5 % 6;
    return now >= flight.boardingAt - leadTime;
  }

  function boardingEntry(queue, ahead = queue.approaching.length) {
    const joinOffset = (queue.line.length + ahead) * boardingSpacing;
    // Use the nearest opening that can fit the line once everyone has moved forward.
    const entrance = [1, queue.snakeEnd, queue.points.length - 1].find(index => joinOffset <= queue.offsets[index]);
    return {position: queue.points[entrance], offset: queue.offsets[entrance]};
  }

  function boardingWalkwayZ(person) {
    return person.zone === "gate" ? 16.1 : 16.1 + person.index % 5 * .48;
  }

  function boardingApproach(queue, {position, offset}, walkwayZ) {
    const [x, , z] = position;
    if (offset !== queue.offsets[1]) return [point(x, walkwayZ), position];
    // Go around the waiting area in front of the short queue entrance.
    const entryX = x + 1;
    const turnZ = z + .92;
    return [point(entryX, walkwayZ), point(entryX, turnZ), point(x, turnZ), position];
  }

  function approachFromWalkway(person, queue, entry) {
    const walkwayZ = boardingWalkwayZ(person);
    const {route} = person;
    const points = [];
    if (route) {
      const walkwayIndex = route.points.findIndex(([, , z]) => z === walkwayZ);
      if (walkwayIndex >= route.index) points.push(...route.points.slice(route.index, walkwayIndex + 1));
      // Passengers taking the direct route from the lounge still need to leave their seat row first.
      else if (walkwayIndex < 0 && person.zone === "gate") points.push(...route.points.slice(route.index, 2));
    }
    const [x, , z] = points.at(-1) ?? person.position;
    if (z !== walkwayZ) points.push(point(x, walkwayZ));
    return [...points, ...boardingApproach(queue, entry, walkwayZ)];
  }

  function shortenBoardingApproaches(queue, now) {
    if (!queue.approaching.some(({offset}, index) => boardingEntry(queue, index).offset < offset)) return;
    queue.nextJoin = now;
    for (const [index, approach] of queue.approaching.entries()) {
      const {person} = approach;
      const entry = boardingEntry(queue, index);
      const points = entry.offset < approach.offset ? approachFromWalkway(person, queue, entry)
        : person.route?.points.slice(person.route.index);
      if (points?.length) {
        const duration = travelTime(person.position, points);
        const joinAt = Math.max(now + duration, queue.nextJoin);
        walk(person, points, undefined, joinAt - duration);
        queue.nextJoin = joinAt + .31;
      } else {
        queue.nextJoin += .31;
      }
      approach.offset = Math.min(entry.offset, approach.offset);
    }
  }

  function gateQueueExit(queue, offset, walkwayZ) {
    if (offset <= queue.offsets[3]) {
      const entry = {position: queue.points[1], offset: queue.offsets[1]};
      const shortExit = boardingApproach(queue, entry, walkwayZ).reverse();
      return offset > queue.offsets[2] ? [queue.points[2], ...shortExit] : shortExit;
    }
    const snakeEnd = queue.offsets[queue.snakeEnd];
    if (offset - snakeEnd <= queue.length - offset) {
      const mouth = queue.points[queue.snakeEnd];
      const path = offset < queue.offsets[4] ? [queue.points[4], mouth] : [mouth];
      return [...path, point(mouth[0], walkwayZ)];
    }
    const tail = queue.points.at(-1);
    return [tail, point(tail[0], walkwayZ)];
  }

  function approachLine(person, queue, {points, offset, duration}, now) {
    const joinAt = Math.max(now + duration, queue.nextJoin);
    queue.nextJoin = joinAt + .31;
    walk(person, points, undefined, joinAt - duration);
    queue.approaching.push({person, offset});
  }

  function callFromLounge(flight, queue, now) {
    if (!hasRoom(queue, flight, now) || now < queue.nextCall) return;
    const waiting = flight.manifest.filter(person => person.zone === "gate" && !person.route &&
      !queue.approaching.some(entry => entry.person === person) && wantsToQueue(person, flight, now));
    if (!waiting.length) return;

    const person = waiting[Math.floor(Math.random() * waiting.length)];
    const entry = boardingEntry(queue);
    const {position, offset} = entry;
    const row = seatAisle(person.spot);
    const aisleX = person.spot.aisleX;
    const points = [point(person.position[0], row), point(aisleX, row)];
    if (aisleX === position[0] && offset !== queue.offsets[1]) points.push(position);
    else points.push(point(aisleX, 16.1), ...boardingApproach(queue, entry, 16.1));
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
    if (flight.stage === "boarding") shortenBoardingApproaches(queue, now);
    const tail = queue.line.at(-1);
    const next = queue.approaching[0];
    if (next && !next.person.route && (!tail || next.offset - tail.offset >= boardingSpacing)) {
      queue.approaching.shift();
      next.person.zone = "gateQueue";
      queue.line.push(next);
      changed = true;
    }
    callFromLounge(flight, queue, now);
    fillVacantLoungeSeats(flight, queue, now);
    return changed;
  }

  function nextCounterToOpen(flow, zone) {
    return flow[zone].find(bank => bank.status !== "open");
  }

  function openCounter(flow, zone) {
    const newBank = nextCounterToOpen(flow, zone);
    if (!newBank) return null;
    newBank.status = "open";
    const open = flow[zone].filter(bank => bank.status === "open").map(bank => ({
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

  function showEntranceWaiter(person, flow) {
    const spot = reserve(person, flow.entranceSpots, 7);
    if (!spot) return false;
    const [x, , z] = spot.position;
    const doorX = Math.max(-8.5, Math.min(8.5, x));
    person.position = point(doorX, entranceZ);
    const path = doorX === x && z > corridorZ ? [spot.position]
      : [point(doorX, corridorZ), point(x, corridorZ), spot.position];
    walk(person, path);
    return true;
  }

  function fillEntranceSpots(flow) {
    for (const person of flow.entrance) {
      if (!person.position && !showEntranceWaiter(person, flow)) break;
    }
  }

  function advanceEntrance(flights, flow, now) {
    const queue = findLine(flow.checkIn);
    if (!queue) {
      let changed = false;
      for (let person = nextPassenger(flights, now); person; person = nextPassenger(flights, now)) {
        person.zone = "entrance";
        flow.entrance.push(person);
        showEntranceWaiter(person, flow);
        changed = true;
      }
      return changed;
    }
    if (now < flow.nextEntry) return false;
    const person = flow.entrance.shift() ?? nextPassenger(flights, now);
    if (!person) return false;
    const entranceX = person.position?.[0] ?? entranceLanes[flow.entrancesUsed++ % entranceLanes.length];
    person.position ??= point(entranceX, entranceZ);
    if (leaveSpot(person)) fillEntranceSpots(flow);
    person.zone = "checkIn";
    scheduleRestroomVisit(person, now, 18, 105);
    queue.line.people.push(person);
    walk(person, [point(entranceX, corridorZ), point(queue.line.x, corridorZ)]);
    flow.nextEntry = now + .17;
    return true;
  }

  function exitPath(person, queue) {
    const {zone, spot, route, position: [x, , z]} = person;
    if (zone === "entrance") {
      const doorX = Math.max(-8.5, Math.min(8.5, x));
      const outside = point(doorX, entranceZ + .6);
      return doorX === x && z > corridorZ ? [outside] : [point(x, corridorZ), point(doorX, corridorZ), outside];
    }
    if (zone === "checkIn" || zone === "landside" || (zone === "security" && z >= securityLayout.checkpointZ)) {
      return [point(x, corridorZ), point(0, corridorZ), point(0, entranceZ + .6)];
    }
    const toExit = [...claimAccess, ...arrivalExitPath];
    if (person.cafeUntil !== undefined) return [...leaveCafePath(person), ...toExit];
    if (person.restroomVisit) {
      const {exit, leaving, approachIndex} = person.restroomVisit;
      if (!route) return [...exit, ...toExit];
      const waypoints = leaving ? route.points.slice(route.index)
        : route.index > approachIndex ? route.points.slice(approachIndex, route.index).reverse()
          : route.points.slice(route.index, approachIndex + 1);
      return [...waypoints, ...toExit];
    }

    const path = [];
    if (zone === "gateQueue") {
      const {offset} = queue.line.find(entry => entry.person === person);
      return [...gateQueueExit(queue, offset, cafeCorridorZ), ...toExit];
    } else if (spot && (zone === "gate" || zone === "otherGate" || zone === "sharedSeats")) {
      const row = seatAisle(spot);
      if (route?.zone === "gate") path.push(...route.points.slice(route.index, -1));
      path.push(point(path.at(-1)?.[0] ?? x, row), point(spot.aisleX, row));
    } else if (zone === "concourse" && route?.zone === "concourse" && !person.strolling) {
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
    flow.entrance = flow.entrance.filter(person => !missed.has(person));
    fillEntranceSpots(flow);
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
      point(aisleX, baggageClaim.approachZ ?? baggageClaim.entranceZ), ...claimAccess];
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
      if (person.zone === "arrivalsExit" && now >= person.restroomAt &&
          person.route?.index === arrival.path.length - claimAccess.length) {
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
      scheduleRestroomVisit(person, now, 1, 40);
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
            scheduleRestroomVisit(person, now, 180, 105);
            person.zone = "concourse";
            goToGateOrWait(person, flight, flow, now);
            changed = true;
          }
          continue;
        }
        const leavingGateSeat = person.zone === "gate" && person.seated;
        if (startDepartureActivity(person, flight, flow, now)) {
          if (leavingGateSeat) fillVacantLoungeSeats(flight, flow.boarding[flight.gate], now);
          changed = true;
          continue;
        }
        if (person.cafeUntil !== undefined || person.strolling || person.retryGateAt !== undefined) {
          changed = recallActivities(person, flight, flow, now) || changed;
        }
        changed = recallWaitingSeat(person, flight, flow, now) || changed;
        const previousZone = person.zone;
        const wasWalking = person.route;
        const walkStart = wasWalking?.startAt ?? -Infinity;
        const walkTime = Math.min(dt, Math.max(0, now - walkStart));
        if (wasWalking && walkTime > 0 && person.zone === "gate" && wasWalking.zone !== "gate") leaveSpot(person);
        changed = follow(person, walkTime) || changed;
        if (wasWalking?.zone === "concourse" && !person.route) {
          if (previousZone === "security") delete person.securityBag;
          if (startDepartureActivity(person, flight, flow, now)) {
            changed = true;
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

    changed = advanceEntrance(flights, flow, now) || changed;

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
      entrance: [], checkIn: [], landside: [], security: [], concourse: [], cafe: [], restroom: [], sharedSeats: [], boarding: [],
      deplaning: [], arrivalsExit: [], exiting: [...flow.exiting], visible: [...flow.exiting, ...flow.arrivals],
      gates: gates.map(() => [])
    };
    for (const entry of flow.arrivals) people[entry.person.zone].push(entry);
    const byFlight = new Map();
    for (const flight of flights) {
      const counts = {outside: 0, entrance: 0, checkIn: 0, landside: 0, security: 0, concourse: 0, cafe: 0, restroom: 0,
        sharedSeats: 0, otherGate: 0, gate: 0, gateQueue: 0, boarding: 0, boarded: 0, missed: 0,
        regularUnboarded: 0, lateOutside: 0, lateAtEntrance: 0, lateInTerminal: 0};
      byFlight.set(flight.id, counts);
      for (const person of flight.manifest) {
        counts[person.zone]++;
        if (person.lateArrival) {
          if (person.zone === "outside") {
            counts.lateOutside++;
          } else if (person.zone === "entrance") {
            counts.lateAtEntrance++;
          } else if (!["boarding", "boarded", "missed"].includes(person.zone)) {
            counts.lateInTerminal++;
          }
        } else if (person.zone !== "boarded") {
          counts.regularUnboarded++;
        }
        if (person.zone === "boarded" || person.zone === "outside" || person.zone === "missed" || !person.position) continue;
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

  return {manifest, create, nextCounterToOpen, openCounter, closeCounter, startDeplaning, closeBoarding, advance, snapshot};
}
