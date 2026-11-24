"use strict";

const airportLayouts = (() => {
  const regional = {
    airfield: {runwayZ: -46, taxiwayZ: -23.2, standZ: -4.75, apronLeft: -42.5, apronRight: 42.5},
    terminal: {floor: .78, left: -37.95, right: 37.95, back: 8.18, front: 28.91, cafeBoundaryX: -13.1, cafeDoorX: -14.48},
    gates: [{id: "A01", x: -25}, {id: "A02", x: 0}, {id: "A03", x: 25}],
    checkIn: {
      front: 22.14, width: 4.95, deskZ: 21.25, sortingZ: 20.14, beltDescent: [15.6, 8.1],
      transfer: [39.2, .22, 6.15],
      banks: [
        {id: "check-in-1", x: 18, deskOffsets: [-2.2, 1.23]},
        {id: "check-in-2", x: 25.2, deskOffsets: [-2.54, .89]},
        {id: "check-in-3", x: 32.5, deskOffsets: [-2.98, .45]}
      ]
    },
    security: {
      front: 23.25, width: 4.3, checkpointZ: 20.7, portalOffsetX: 1.05, portalWidth: .88, exitZ: 19.10,
      belt: {offsetX: -.75, surfaceHeight: .615, entryZ: 22.61, exitZ: 19.44},
      banks: [{id: "security-1", x: -7.2}, {id: "security-2", x: -.7}, {id: "security-3", x: 5.8}]
    },
    baggageClaim: {
      side: "west", outerX: -52.4, doorZ: 17.7, doorWidth: 2.5, exitX: -39.8, exitWidth: 1.65,
      benchRows: [{z: 15.32, direction: 1}, {z: 21.67, direction: -1}],
      standingRows: [16.22, 16.77, 18.6, 19.14, 19.68, 20.22],
      carousels: [
        {id: "carousel-1", number: 1, x: -50.6, z: 25.05},
        {id: "carousel-2", number: 2, x: -50.6, z: 12.35}
      ]
    },
    sharedBenches: [-12.5, 12.5].flatMap((x, side) => [9.75, 11.75, 13.75].map((z, row) =>
      ({id: "shared-bench-" + (side * 3 + row + 1), x, z}))),
    cafeTables: [-30.8, -27.2, -23.6, -20.0, -16.8].map((x, index) =>
      ({id: "cafe-table-" + (index + 1), x, z: x < -25 ? 24.25 : 23.35}))
  };
  const stationSpacing = 3.6;
  const queueWidth = 2.95;
  const [leftLaneX, middleLaneX, rightLaneX] = [-2, -1, 0].map(offset => -3.15 + offset * stationSpacing);
  const [leftDeskX, middleDeskX, rightDeskX] = [0, 1, 2].map(offset => 3.45 + offset * stationSpacing);
  const starter = {
    ...regional,
    airfield: {...regional.airfield, apronRight: 26.5},
    terminal: {...regional.terminal, right: 12.75},
    gates: regional.gates.slice(0, 2),
    checkIn: {
      ...regional.checkIn,
      width: queueWidth,
      beltDescent: [19.75, 18.45],
      transfer: [13.65, .22, 6.15],
      banks: [{id: "check-in-1", x: leftDeskX, deskOffsets: [0]}, {id: "check-in-2", x: middleDeskX, deskOffsets: [0]}]
    },
    security: {
      ...regional.security,
      width: queueWidth,
      banks: [{id: "security-1", x: middleLaneX}, {id: "security-2", x: rightLaneX}]
    },
    baggageClaim: {
      ...regional.baggageClaim,
      side: "east", outerX: 25.05, exitX: 14.1,
      benchRows: [{z: 24.35, direction: 1}, {z: 26.6, direction: -1}],
      standingRows: [15.45, 15.9, 16.4, 22.35, 22.8, 23.25],
      carousels: [{...regional.baggageClaim.carousels[0], x: 15.35, z: 19.3}]
    },
    restrooms: {id: "concourse-restrooms", x: 19, frontZ: 11.42, roomSize: 2.85, roomCount: 4,
      aisleX: 11.2, approachZ: 17.7, doorZ: 12.7, doorWidth: 1.55, dividerZ: 14.8},
    sharedBenches: regional.sharedBenches.map(bench =>
      bench.x > 0 ? {...bench, x: -12.5} : {...bench, x: -36, aisleX: -34.42})
  };
  const carouselX = starter.baggageClaim.carousels[0].x;
  const insetTerminal = {
    ...starter.terminal, right: 50.25, securityEndX: 12.55
  };
  const toiletsBesideCheckIn = {
    ...starter.restrooms, x: 18.35, frontZ: 25.95, roomSize: 2.45, direction: -1,
    aisleX: 18.35, doorZ: 24.95
  };
  const insetClaim = {
    ...starter.baggageClaim, outerX: insetTerminal.right, leftX: 24.2, backZ: 19.6, doorX: 35.6, doorZ: 19.6,
    approachZ: 17.7, exitX: 35.6, aisleZ: 21.3,
    benchRows: [{z: 27.55, direction: -1, centers: [29.75, 44.15]}],
    standingRows: [20.3, 20.8],
    label: [42.3, 1.1, 20.3],
    carousels: [{...starter.baggageClaim.carousels[0], x: 25.8, z: 23.65}]
  };
  const sharedBenchesBetweenGates = [9.55, 11.25, 12.95, 14.65].map(z => ({x: 12.5, z, aisleX: 14.65}));
  const seatingNook = {x: 18.55, z: 24.8};
  const nookBenches = [23.35, 26.55].flatMap(z => [
    {x: 16.25, z, aisleX: 14.6}, {x: 21.1, z, aisleX: 22.95}
  ]);
  const cornerRestroomLobby = {
    ...starter.restrooms, lobbyLeft: regional.terminal.right, lobbyRight: insetTerminal.right,
    x: (regional.terminal.right + insetTerminal.right) / 2, aisleX: regional.terminal.right - 1.55
  };
  const concourseWithToiletLobby = {
    terminal: insetTerminal,
    restrooms: {...toiletsBesideCheckIn, lobbyEntryZ: starter.security.checkpointZ},
    baggageClaim: insetClaim,
    sharedBenches: sharedBenchesBetweenGates
  };
  const currentGateLayoutRevision = 5;
  const gateLayouts = {
    2: {
      terminal: insetTerminal, restrooms: toiletsBesideCheckIn, baggageClaim: insetClaim,
      sharedBenches: [40, 44.3].flatMap(x => [10.65, 13.15].map(z => ({x, z, aisleX: x - 1.85})))
    },
    3: {
      terminal: {...insetTerminal, securityEndX: 14.1},
      restrooms: cornerRestroomLobby,
      baggageClaim: {...insetClaim, leftX: 14.1, benchRows: [{z: 27.55, direction: -1, centers: [19.5, 29.75, 44.15]}]},
      sharedBenches: sharedBenchesBetweenGates
    },
    4: concourseWithToiletLobby,
    [currentGateLayoutRevision]: {
      ...concourseWithToiletLobby,
      restrooms: cornerRestroomLobby,
      seatingNook,
      baggageClaim: {...insetClaim, singleCarouselBenchRows: [{z: 23.3, direction: 1, centers: [44.15]}]},
      sharedBenches: [...sharedBenchesBetweenGates, ...nookBenches]
    }
  };
  const expandedClaimCarousel = {x: 38.75, z: 23.65};
  const upgrades = {
    gate: {
      name: "Third gate · A03", price: 140000, description: "Handle a third aircraft at the terminal.",
      site: {id: "east-concourse", name: "East end of the concourse", note: "The concourse extends east with shared seating, a corner toilet lobby and a larger baggage claim hall."}
    },
    carousel: {
      name: "Second baggage carousel", price: 115000, description: "Handle two baggage claims at once.",
      site: {id: "near-exit", name: "Near arrivals exit", x: carouselX, z: 25.05},
      legacySite: {id: "near-belt", name: "Near Carousel 1", x: carouselX, z: 24.35}
    },
    security: {
      name: "Third security lane", price: 120000, description: "Add a screening lane you can staff when queues build.",
      site: {id: "west", name: "Beside the café", bankXs: [middleLaneX, rightLaneX, leftLaneX]},
      legacySite: {id: "middle", name: "Between the lanes", bankXs: [leftLaneX, rightLaneX, middleLaneX]}
    },
    checkIn: {
      name: "Third check-in desk", price: 110000, description: "Add a desk with its own queue and baggage belt.",
      site: {id: "middle", name: "Between the desks", bankXs: [leftDeskX, rightDeskX, middleDeskX],
        note: "Desk 2 shifts toward baggage claim to make room."},
      legacySite: {id: "near-security", name: "Near security", bankXs: [middleDeskX, rightDeskX, leftDeskX]}
    }
  };

  function upgradeSite(type, id) {
    const {site, legacySite} = upgrades[type];
    return [site, legacySite].find(placement => placement && placement.id === id);
  }

  function arrangeBanks(banks, added, positions) {
    return [...banks, added].map((bank, index) => ({...bank, x: positions[index]}));
  }

  function withUpgrades(purchased, {gateLayoutRevision = currentGateLayoutRevision} = {}) {
    const gate = upgradeSite("gate", purchased.gate);
    const carousel = upgradeSite("carousel", purchased.carousel);
    const lane = upgradeSite("security", purchased.security);
    const desk = upgradeSite("checkIn", purchased.checkIn);
    const {baggageClaim, security, checkIn, restrooms, terminal, airfield} = starter;
    const expanded = gate && gateLayouts[gateLayoutRevision];
    const extension = gate && !expanded ? regional.terminal.right - terminal.right : 0;
    const claim = expanded ? expanded.baggageClaim : baggageClaim;
    const carousels = carousel ? [...claim.carousels,
      {id: "carousel-2", number: 2, ...(expanded ? expandedClaimCarousel : {x: carousel.x, z: carousel.z})}]
      : claim.carousels;
    return {
      ...starter,
      gates: gate ? regional.gates : starter.gates,
      airfield: gate ? {...airfield, apronRight: regional.airfield.apronRight} : airfield,
      terminal: expanded ? expanded.terminal : extension ? {...terminal, right: terminal.right + extension} : terminal,
      seatingNook: expanded?.seatingNook,
      restrooms: expanded ? expanded.restrooms
        : extension ? {...restrooms, x: restrooms.x + extension, aisleX: restrooms.aisleX + extension} : restrooms,
      sharedBenches: expanded ? [...starter.sharedBenches, ...expanded.sharedBenches] : starter.sharedBenches,
      baggageClaim: {
        ...claim,
        outerX: claim.outerX + extension,
        exitX: claim.exitX + extension,
        carousels: extension ? carousels.map(belt => ({...belt, x: belt.x + extension})) : carousels,
        benchRows: carousel
          ? (expanded ? claim.benchRows : [{z: 28.18, direction: -1}])
          : [...claim.benchRows, ...(claim.singleCarouselBenchRows ?? [])],
        standingRows: carousel && !expanded ? claim.standingRows.slice(0, 3) : claim.standingRows
      },
      security: lane ? {
        ...security,
        banks: arrangeBanks(security.banks, {id: "security-3"}, lane.bankXs)
      } : security,
      checkIn: {
        ...checkIn,
        transfer: extension ? [checkIn.transfer[0] + extension, ...checkIn.transfer.slice(1)] : checkIn.transfer,
        banks: desk ? arrangeBanks(checkIn.banks, {id: "check-in-3", deskOffsets: [0]}, desk.bankXs) : checkIn.banks
      }
    };
  }

  return {regional, starter, upgrades, upgradeSite, withUpgrades, currentGateLayoutRevision};
})();
