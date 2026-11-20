"use strict";

const passengerFlow = (() => {
  const walkTime = 5;
  const rates = {checkIn: 7.8, securityPerLane: 2.4, boarding: 6.4};

  function manifest(capacity, initial = {}) {
    const people = [];
    for (const [zone, count] of Object.entries(initial)) {
      for (let i = 0; i < count; i++) {
        const person = {index: people.length, zone};
        if (zone === "concourse") person.walkStarted = -walkTime * i / count;
        people.push(person);
      }
    }
    while (people.length < capacity) people.push({index: people.length, zone: "checkIn"});
    return people;
  }

  function advance(flights, credit, now, dt, lanes, onReady) {
    const manifests = flights.flatMap(flight => flight.manifest);
    let changed = false;
    for (const person of manifests) {
      if (person.zone === "concourse" && now - person.walkStarted >= walkTime) {
        person.zone = "gate";
        changed = true;
      }
    }

    function release(people, from, to, allowance) {
      let remaining = Math.floor(allowance);
      for (const person of people) {
        if (!remaining) break;
        if (person.zone !== from) continue;
        person.zone = to;
        if (to === "concourse") person.walkStarted = now;
        remaining--;
        changed = true;
      }
      return allowance % 1;
    }

    credit.security = release(manifests, "security", "concourse", credit.security + dt * lanes * rates.securityPerLane);
    credit.checkIn = release(manifests, "checkIn", "security", credit.checkIn + dt * rates.checkIn);
    for (const flight of flights) {
      if (flight.stage !== "boarding") continue;
      flight.boardingCredit = release(flight.manifest, "gate", "boarded", flight.boardingCredit + dt * rates.boarding);
      if (flight.manifest.every(person => person.zone === "boarded")) onReady(flight);
    }
    return changed;
  }

  function snapshot(flights, gateCount) {
    const people = {
      checkIn: [], security: [], concourse: [],
      gates: Array.from({length: gateCount}, () => [])
    };
    const byFlight = new Map();
    let total = 0;
    for (const flight of flights) {
      const counts = {checkIn: 0, security: 0, concourse: 0, gate: 0, boarded: 0};
      byFlight.set(flight.id, counts);
      for (const person of flight.manifest) {
        counts[person.zone]++;
        if (person.zone === "boarded") continue;
        const section = person.zone === "gate" ? people.gates[flight.gate] : people[person.zone];
        section.push({person, flight});
        total++;
      }
    }
    return {...people, byFlight, total};
  }

  return {manifest, advance, snapshot, walkTime};
})();
