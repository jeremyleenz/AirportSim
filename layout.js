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
  const starter = {
    ...regional,
    airfield: {...regional.airfield, apronRight: 26.5},
    terminal: {...regional.terminal, right: 12.75},
    gates: regional.gates.slice(0, 2),
    checkIn: {
      ...regional.checkIn,
      width: 4.5,
      beltDescent: [19.75, 18.45],
      transfer: [13.65, .22, 6.15],
      banks: [{id: "check-in-1", x: 4.35, deskOffsets: [0]}, {id: "check-in-2", x: 9.8, deskOffsets: [0]}]
    },
    security: {
      ...regional.security,
      banks: [{id: "security-1", x: -7.85}, {id: "security-2", x: -3.15}]
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
  const laneTwoX = starter.security.banks[1].x;
  const middleLaneSpacing = 3.3;
  const [deskOne, deskTwo] = starter.checkIn.banks;
  const westLaneX = -11.05;
  const nearSecurityDeskX = 3.25;
  const carouselX = starter.baggageClaim.carousels[0].x;
  const upgrades = {
    carousel: {
      name: "Second baggage carousel", price: 62000, description: "Handle two baggage claims at once.",
      sites: [{id: "near-belt", name: "Near Carousel 1", x: carouselX, z: 24.35},
        {id: "near-exit", name: "Near arrivals exit", x: carouselX, z: 25.05}]
    },
    security: {
      name: "Third security lane", price: 78000, description: "Add a screening lane you can staff when queues build.",
      sites: [{id: "west", name: "Beside the café", x: westLaneX, firstLaneX: (westLaneX + laneTwoX) / 2},
        {id: "middle", name: "Between the lanes", x: laneTwoX - middleLaneSpacing, firstLaneX: laneTwoX - 2 * middleLaneSpacing}]
    },
    checkIn: {
      name: "Third check-in desk", price: 56000, description: "Add a desk with its own queue and baggage belt.",
      sites: [{id: "middle", name: "Between the desks", x: (deskOne.x + deskTwo.x) / 2},
        {id: "near-security", name: "Near security", x: nearSecurityDeskX, firstDeskX: (nearSecurityDeskX + deskTwo.x) / 2}]
    }
  };

  function withUpgrades(purchased) {
    const carousel = upgrades.carousel.sites.find(({id}) => id === purchased.carousel);
    const lane = upgrades.security.sites.find(({id}) => id === purchased.security);
    const desk = upgrades.checkIn.sites.find(({id}) => id === purchased.checkIn);
    const {baggageClaim, security, checkIn} = starter;
    return {
      ...starter,
      baggageClaim: carousel ? {
        ...baggageClaim,
        carousels: [...baggageClaim.carousels, {id: "carousel-2", number: 2, x: carousel.x, z: carousel.z}],
        benchRows: [{z: 28.18, direction: -1}],
        standingRows: baggageClaim.standingRows.slice(0, 3)
      } : baggageClaim,
      security: lane ? {
        ...security, width: 3.05,
        banks: [...security.banks.map((bank, index) => index === 0 && lane.firstLaneX ? {...bank, x: lane.firstLaneX} : bank),
          {id: "security-3", x: lane.x}]
      } : security,
      checkIn: desk ? {
        ...checkIn, width: 2.15,
        banks: [...checkIn.banks.map((bank, index) => index === 0 && desk.firstDeskX ? {...bank, x: desk.firstDeskX} : bank),
          {id: "check-in-3", x: desk.x, deskOffsets: [0]}]
      } : checkIn
    };
  }

  return {regional, starter, upgrades, withUpgrades};
})();
