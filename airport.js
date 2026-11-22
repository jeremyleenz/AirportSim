"use strict";

const airport = (() => {
  const {Mesh} = world;
  const gates = [-25, 0, 25].map((x, i) => ({x, name: "A0" + (i + 1)}));
  const colors = {
    grass: "#8fa486", asphalt: "#545f60", apron: "#9ca7a3", concrete: "#deded0",
    warm: "#e9e4d5", frame: "#506c70", glass: "#90babb", pale: "#d9e7df",
    white: "#f4f2df", paint: "#efbf62", ink: "#293e45", teal: "#4b847d"
  };
  const {grass, asphalt, apron, concrete, warm, frame, glass, pale, white, paint, ink, teal} = colors;
  const floor = .78;
  const runwayZ = -46;
  const taxiwayZ = -23.2;
  const terminalEdge = 37.95;
  const terminalBackZ = 8.18;
  const terminalFrontZ = 28.91;
  const cafeBoundaryX = -13.1;
  const cafeDoorX = -14.48;
  const claimRoom = {left: -52.4, right: -terminalEdge, back: terminalBackZ, front: terminalFrontZ, doorZ: 17.7, doorWidth: 2.5};
  const airsideExit = {x: -39.8, z: claimRoom.front + 1.25, thresholdZ: claimRoom.front, width: 1.65};
  const roadsidePlanters = [-36.7, -33, -24, -7, 5, 24, 38];
  const checkInQueue = {centers: [18, 25.2, 32.5], front: 22.14, width: 4.95, deskZ: 21.25};
  const checkInDesks = Array.from({length: 6}, (_, index) => 15.8 + index * 3.43);
  const sortingBeltZ = 20.14;
  const sortingBeltY = floor + .39;
  const baggageTransfer = [39.2, .22, 6.15];
  const securityBelt = {offsetX: -.75, surfaceY: floor + .615, entryZ: 22.61, exitZ: 19.44};
  const securityQueue = {centers: [-7.2, -.7, 5.8], front: 23.25, width: 4.3,
    checkpointZ: 20.7, portalOffsetX: 1.05, portalWidth: .88, exitZ: 19.10, belt: securityBelt};
  const baggageColors = ["#c96445", "#376582", "#cf9d45", "#586a52"];

  function claimCarousel(z) {
    const left = -50.6, right = -44.05, radius = .55, height = floor + .43;
    const arc = (x, start) => Array.from({length: 9}, (_, i) => {
      const angle = start + i * Math.PI / 8;
      return [x + radius * Math.cos(angle), height, z + radius * Math.sin(angle)];
    });
    const loop = [...arc(right, -Math.PI / 2), ...arc(left, Math.PI / 2)];
    loop.push(loop[0]);
    const waitingSpots = [-1, 1].flatMap(side => Array.from({length: 42}, (_, index) => {
      const row = index % 3;
      const x = left + .15 + Math.floor(index / 3) * .47 + row * .11;
      const spacing = 1.26 + row * .39 + (index * 11 % 5 - 2) * .035;
      return {position: [x, floor, z + side * spacing], pickup: [x, floor, z + side * 1.16],
        aisleZ: z + side * 2.36, angle: side > 0 ? Math.PI : 0, seated: false};
    }));
    return {left, right, z, radius, height, loop, waitingSpots,
      feed: [[right + 1.85, height + .48, z - radius], [right + .55, height, z - radius], loop[0]]};
  }

  const baggageClaim = {
    entranceZ: claimRoom.doorZ,
    carousels: [25.05, 18.7, 12.35].map(claimCarousel),
    label: [claimRoom.left + 3.8, .85, claimRoom.front + 3.1]
  };
  const queueRows = 9;
  const queueSpacing = .47;
  const loungeBenches = [-7.32, 1.28, 4.17, 7.06];
  const sharedBenches = [-12.5, 12.5].flatMap(x => [9.75, 11.75, 13.75].map(z => ({x, z})));
  const cafeTables = [-30.8, -27.2, -23.6, -20.0, -16.8].map(x => ({x, z: x < -25 ? 24.25 : 23.35}));

  function benchSeats(x, z, angle, aisleX) {
    return [-.86, 0, .86].map(dx => ({position: [x + dx, floor, z], angle, aisleX, seated: true}));
  }

  function loungeSeats(x) {
    return loungeBenches.flatMap(dx => [10.25, 12.8].flatMap((z, row) =>
      benchSeats(x + dx, z, row ? Math.PI : 0, x + (dx < 0 ? -9.15 : 9.16))));
  }

  const sharedSeats = sharedBenches.flatMap(({x, z}) => benchSeats(x, z, 0, x - 1.95));
  const cafeSeats = cafeTables.flatMap(({x, z}) => [-1, 1].map(side => ({
    position: [x, floor + .03, z + .91 * side],
    angle: side > 0 ? Math.PI : 0,
    aisleZ: side > 0 ? 26.77 : 21.35,
    seated: true
  })));

  function bridgePath(x) {
    return [[x - 4.7, floor, terminalBackZ], [x - 4.7, floor, 7.5],
      [x - 3.35, 1.45, 3.3], [x - 1.05, 1.45, 1.2], [x - .60, 1.45, 1.2]];
  }

  function luggageFromDesk(x) {
    return [[x - .22, floor + .754, checkInQueue.deskZ], [x - .22, sortingBeltY, sortingBeltZ],
      [baggageTransfer[0], sortingBeltY, sortingBeltZ], [baggageTransfer[0], sortingBeltY, 15.6],
      [baggageTransfer[0], baggageTransfer[1], 8.1], baggageTransfer];
  }

  function luggageToAircraft(gate) {
    const {x} = gates[gate];
    const [, height, apronZ] = baggageTransfer;
    return [baggageTransfer, [x + 4.45, height, apronZ], [x + 3.05, height, .45], [x + 1.08, 1.21, -.58]];
  }

  function boardingPath(x) {
    return [[-4.7, 9.22], [-4.7, 13.64], [-2.88, 13.64], [-2.88, 9.79],
      [-1.06, 9.79], [-1.06, 14.66], [9.16, 14.66]].map(([dx, z]) => [x + dx, floor, z]);
  }
  let seed = 561;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function curve(points, steps = 16) {
    const result = [];
    for (let i = 0; i <= steps; i++) {
      let t = i / steps;
      let p = points;
      while (p.length > 1) p = p.slice(0, -1).map((v, n) => v.map((c, axis) => c + (p[n + 1][axis] - c) * t));
      result.push(p[0]);
    }
    return result;
  }

  const digitSegments = {
    "0": [0, 1, 2, 3, 4, 5], "1": [1, 2], "2": [0, 1, 6, 4, 3],
    "7": [0, 1, 2], "9": [0, 1, 2, 3, 5, 6]
  };
  function runwayNumber(mesh, text, x, z, direction) {
    const strokes = [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [1, 2]], [[1, 2], [0, 2]],
      [[0, 2], [0, 1]], [[0, 1], [0, 0]], [[0, 1], [1, 1]]];
    [...text].forEach((digit, i) => {
      for (const s of digitSegments[digit]) {
        const line = strokes[s].map(([u, v]) => [x + direction * (1 - v) * 1.37, z + direction * (u + i * 1.7 - 1.35) * 1.25]);
        mesh.line(...line, .29, .041, white);
      }
    });
  }

  function ground() {
    const mesh = new Mesh();
    mesh.rect(0, -.08, 0, 560, 560, grass);
    const grassColors = ["#90a688", "#8ba184", "#93a989", "#8da382"];
    for (let i = -9; i <= 9; i++) mesh.rect(i * 12 + 6, -.076, -10, 12, 145, grassColors[(i + 12) % 4]);
    mesh.rect(0, .005, runwayZ, 102, 15.5, "#707b73");
    mesh.rect(0, .012, runwayZ, 100, 13.5, "#4c575a");
    for (const z of [runwayZ - 6.15, runwayZ + 6.15]) mesh.rect(0, .025, z, 98, .16, white);
    for (let x = -45; x < 47; x += 7.4) mesh.rect(x, .026, runwayZ, 3.55, .2, white);
    for (const x of [-32.5, 32.5]) {
      for (let n = -3; n <= 3; n++) mesh.rect(x, .029, runwayZ + n * .76, 5.2, .18, "#909994");
    }
    for (let x = -48; x <= 48; x += 2) {
      for (const z of [runwayZ - 6.7, runwayZ + 6.7]) mesh.rect(x, .024, z, .15, .25, "#a4abb1");
    }
    runwayNumber(mesh, "09", -38.5, runwayZ, 1);
    runwayNumber(mesh, "27", 38.5, runwayZ, -1);

    mesh.rect(0, .013, taxiwayZ, 99, 6.7, asphalt);
    for (const x of [-45, 45]) {
      mesh.rect(x, .014, (runwayZ + taxiwayZ) / 2, 9, taxiwayZ - runwayZ, asphalt);
      mesh.path(curve([[x, runwayZ + 2.5], [x, taxiwayZ + 1.2], [x * .83, taxiwayZ]]), .16, .026, paint);
    }
    mesh.rect(0, .018, taxiwayZ, 74.8, .15, paint);
    mesh.rect(0, .009, -7.35, 85, 23.5, apron);
    mesh.rect(0, .012, -18.4, 85, 1.4, "#858f8c");
    mesh.rect(0, .015, -17.7, 84.9, .16, white);
    for (let x = -39; x < 43; x += 4) mesh.rect(x, .018, -17.3, 2.4, .10, "#dce3d3");
    for (let x = -42.5; x <= 43; x += 5) mesh.rect(x, .011, -7.1, .052, 22, "#899593");
    for (let z = -15; z <= 8; z += 3.8) mesh.rect(0, .012, z, 84.8, .055, "#8a9691");

    for (const {x} of gates) {
      mesh.path(curve([[x - 9, taxiwayZ], [x, taxiwayZ], [x, -16]]), .16, .03, paint);
      mesh.line([x, -16], [x, 3.45], .14, .028, paint);
      mesh.rect(x, .031, 2.2, 2.25, .17, paint);
      mesh.path([[x - 10.7, 5.5], [x - 10.7, -11.3], [x - 8.8, -15], [x + 8.8, -15],
        [x + 10.7, -11.3], [x + 10.7, 5.5]], .1, .031, "#dae0d2");
      const hatch = "#bf755b";
      const a = x - 7.7;
      mesh.path([[a, 3.9], [a + 4.8, 3.9], [a + 4.8, 7.9], [a, 7.9], [a, 3.9]], .12, .033, hatch);
      for (let n = 0; n < 5; n++) mesh.line([a + n * .85, 7.9], [a + n * .85 + .85, 3.9], .105, .034, hatch);
      for (const side of [-1, 1]) {
        for (let n = 0; n < 3; n++) mesh.rect(x + side * (1.7 + n * .48), .031, -13.3, .28, .14, white);
      }
    }

    mesh.rect((claimRoom.left + 44.5) / 2, .02, 31.0, 44.5 - claimRoom.left, 6.5, "#a5ada1");
    mesh.rect(0, .025, 36.2, 104, 7.8, asphalt);
    mesh.rect(0, .031, 32.55, 93, .14, "#d4d4bb");
    mesh.rect(0, .032, 39.85, 97, .13, "#bac4b9");
    for (let x = -48; x < 52; x += 3.7) mesh.rect(x, .033, 36.0, 1.7, .13, "#dce0cf");
    for (const x of [airsideExit.x, 11]) {
      for (let n = -3; n <= 3; n++) mesh.rect(x + n * .58, .033, 34.15, .26, 2.55, white);
    }
    mesh.rect(-26.5, .008, 46, 39, 11.5, "#64726d");
    mesh.rect(-26.5, .012, 50.2, 38, .12, "#d9dcbd");
    for (let x = -44; x < -7; x += 2.6) mesh.rect(x, .014, 48, .09, 4.4, "#c5c9aa");
    mesh.rect(23, .013, 45.5, 37, 6.6, "#b0b8a5");
    mesh.rect(23, .017, 46.2, 37, 3.4, "#8c9e85");
    for (const x of roadsidePlanters) {
      mesh.rect(x, .035, 30.9, 3.6, 1.45, "#798e77");
      mesh.rect(x, .037, 31.67, 3.8, .13, concrete);
    }
    return mesh;
  }

  function wall(mesh, x, z, length, alongX, height) {
    const span = (a, b, y, h, color, thickness) => {
      mesh.box(x + (alongX ? a : 0), y, z + (alongX ? 0 : a),
        alongX ? b : thickness, h, alongX ? thickness : b, color);
    };
    span(0, length, floor, .22, frame, .23);
    span(0, length, floor + .22, height - .37, glass, .155);
    span(0, length, floor + height - .15, .15, "#d8e5db", .27);
    span(0, length, floor + height * .46, .065, "#76999b", .19);
    for (let p = -length / 2 + .06; p < length / 2; p += 1.68) {
      span(p, .062, floor + .2, height - .22, frame, .21);
    }
  }

  function bench(mesh, x, z, color, direction = 1) {
    mesh.box(x, floor, z, 2.47, .19, .60, "#606a68");
    for (let i = -1; i <= 1; i++) {
      mesh.box(x + i * .86, floor + .19, z, .76, .13, .58, color);
      mesh.box(x + i * .86, floor + .25, z - direction * .25, .76, .31, .12, color);
    }
  }

  function planter(mesh, x, y, z, size = 1) {
    mesh.ring(x, y, z, .24 * size, .34 * size, .48 * size, "#b4b5a4", 6);
    mesh.ring(x, y + .45 * size, z, .36 * size, .22 * size, .53 * size, "#5c846a", 7);
    mesh.ring(x - .13 * size, y + .53 * size, z, .10 * size, .3 * size, .39 * size, "#749773", 7);
  }

  function desk(mesh, x, z, tint) {
    mesh.box(x, floor, z, 1.45, .65, .65, tint);
    mesh.box(x, floor + .64, z, 1.56, .11, .76, white);
    mesh.box(x + .31, floor + .75, z - .1, .29, .27, .095, ink);
    mesh.box(x + .31, floor + .81, z - .047, .21, .13, .011, "#a7d4c9");
  }

  function bollard(mesh, x, z, y = floor) {
    mesh.ring(x, y, z, .12, .13, .07, frame, 6);
    mesh.ring(x, y + .07, z, .043, .048, .39, "#56686b", 5);
    mesh.ring(x, y + .44, z, .07, .07, .06, "#95ada8", 6);
  }

  function queue(mesh, x, {front, width}) {
    const back = front + (queueRows - 1) * queueSpacing;
    for (const edge of [-width / 2, width / 2]) {
      mesh.box(x + edge, floor + .445, (front + back) / 2, .041, .049, back - front, "#63817f");
      for (const z of [front, (front + back) / 2, back]) bollard(mesh, x + edge, z);
    }
    for (const offset of [-width * .24, 0, width * .24]) {
      mesh.rect(x + offset, floor + .034, (front + back) / 2, .045, back - front, "#afbeb4");
    }
  }

  function boardingQueue(mesh, x) {
    const path = boardingPath(x);
    mesh.path(path.map(([px, , z]) => [px, z]), .72, floor + .025, "#b8cbc4");
    for (const [left, right, from, to] of [[0, null, 9.64, 14.1], [0, 2, 9.64, 12.88],
      [2, 4, 10.49, 14.04], [4, null, 9.58, 14.08]]) {
      const rail = right === null ? path[left][0] + (left === 0 ? -.91 : .91)
        : (path[left][0] + path[right][0]) / 2;
      mesh.box(rail, floor + .445, (from + to) / 2, .041, .049, to - from, "#63817f");
      for (const z of [from, (from + to) / 2, to]) bollard(mesh, rail, z);
    }
  }

  function bridge(mesh, x) {
    const points = bridgePath(x).slice(0, -1);
    for (let i = 1; i < points.length; i++) {
      const [ax, ay, az] = points[i - 1];
      const [bx, by, bz] = points[i];
      const width = .57;
      mesh.face([[ax - width, ay, az], [bx - width, by, bz], [bx + width, by, bz],
        [ax + width, ay, az]], pale, [0, 1, 0]);
      for (const side of [-1, 1]) {
        const a = ax + side * width, b = bx + side * width;
        const height = side === -1 ? .15 : .43;
        mesh.face([[a, ay - .20, az], [b, by - .20, bz], [b, by + height, bz],
          [a, ay + height, az]], glass, [side, 0, 0]);
      }
    }
    mesh.box(x - 3.35, .04, 3.3, .39, 1.19, .54, frame);
    mesh.box(x - 4.68, .04, 7.72, .63, .63, .75, frame);
  }

  function securityPartition(mesh, x, z, length, alongX) {
    const span = (offset, width, y, height, depth, color) => {
      mesh.box(x + (alongX ? offset : 0), floor + y, z + (alongX ? 0 : offset),
        alongX ? width : depth, height, alongX ? depth : width, color);
    };
    span(0, length, 0, .12, .19, "#788c87");
    span(0, length, .12, .56, .07, "#aec5be");
    span(0, length, .68, .06, .13, "#dce9df");
    const panels = Math.ceil(length / 2.8);
    for (let i = 1; i < panels; i++) {
      span(length * (i / panels - .5), .06, .12, .56, .11, "#728e85");
    }
  }

  function securityCheckpoint(mesh) {
    const {centers, checkpointZ, portalOffsetX, portalWidth} = securityQueue;
    const {offsetX, surfaceY, entryZ, exitZ} = securityBelt;
    const beltLength = entryZ - exitZ + .57;
    const beltZ = (entryZ + exitZ) / 2;
    const partition = (left, right) => securityPartition(mesh, (left + right) / 2, checkpointZ, right - left, true);
    let left = cafeBoundaryX;
    for (const x of centers) {
      const portalX = x + portalOffsetX;
      const leftPost = portalX - portalWidth / 2;
      const rightPost = portalX + portalWidth / 2;
      const beltX = x + offsetX;
      partition(left, beltX - .56);
      partition(beltX + .56, leftPost);
      left = rightPost;

      mesh.box(beltX, floor, beltZ, .95, surfaceY - floor - .055, beltLength, "#667e7d");
      mesh.box(beltX, surfaceY - .055, beltZ, .76, .055, beltLength, "#3e5356");
      for (let z = exitZ - .15; z <= entryZ + .15; z += .2) {
        mesh.rect(beltX, surfaceY + .003, z, .71, .025, "#627b7c");
      }
      for (const side of [-1, 1]) {
        mesh.box(beltX + side * .49, floor, checkpointZ, .14, 1.15, .98, "#7f9993");
      }
      mesh.box(beltX, surfaceY, checkpointZ, .84, .53, .54, ink);
      mesh.box(beltX, floor + 1.07, checkpointZ, 1.12, .09, .98, "#7f9993");
      mesh.box(beltX, floor + 1.14, checkpointZ, 1.16, .10, .98, "#dfe9e0");
      mesh.box(beltX + .53, floor + .82, checkpointZ + .23, .027, .16, .25, ink);
      for (const edge of [leftPost, rightPost]) {
        mesh.box(edge, floor, checkpointZ, .14, 1.62, .34, "#dfe9e0");
        mesh.box(edge, floor, checkpointZ, .17, .19, .37, frame);
      }
      mesh.box(portalX, floor + 1.54, checkpointZ, portalWidth + .19, .20, .38, "#dfe9e0");
      mesh.box(portalX, floor + 1.60, checkpointZ + .194, portalWidth * .63, .08, .025, teal);
      mesh.rect(portalX, floor + .026, checkpointZ, portalWidth, 1.2, "#97b8ac");
      queue(mesh, x, securityQueue);
    }
    partition(left, terminalEdge);
    securityPartition(mesh, cafeBoundaryX, (checkpointZ + terminalFrontZ) / 2, terminalFrontZ - checkpointZ, false);
  }

  function terminal() {
    const mesh = new Mesh();
    mesh.box(0, .031, 18.5, 76, .75, 21, "#bdc9c1");
    mesh.box(0, .46, 18.5, 76.3, .32, 21.24, "#ecede1");
    mesh.rect(0, floor + .006, 18.5, 75.8, 20.85, warm);
    const {checkpointZ} = securityQueue;
    mesh.rect(0, floor + .008, (terminalBackZ + checkpointZ) / 2, 75.8, checkpointZ - terminalBackZ, "#dce7db");
    mesh.rect((cafeBoundaryX - terminalEdge) / 2, floor + .008, (checkpointZ + terminalFrontZ) / 2,
      cafeBoundaryX + terminalEdge, terminalFrontZ - checkpointZ, "#dce7db");
    mesh.rect(0, floor + .010, 17.1, 75.8, 3.6, "#e9ece3");
    for (let x = -37.8; x < 38; x += 1.9) mesh.rect(x, floor + .013, 18.5, .032, 20.8, "#c5cec6");
    for (let z = 8.3; z < 29; z += 1.42) mesh.rect(0, floor + .015, z, 75.7, .034, "#c8cfc5");
    let wallStart = -terminalEdge;
    for (const gate of gates) {
      const door = bridgePath(gate.x)[0][0];
      const wallEnd = door - .72;
      wall(mesh, (wallStart + wallEnd) / 2, terminalBackZ, wallEnd - wallStart, true, 2.6);
      mesh.box(door, floor + 1.05, terminalBackZ, 1.54, .19, .24, pale);
      wallStart = door + .72;
    }
    wall(mesh, (wallStart + terminalEdge) / 2, terminalBackZ, terminalEdge - wallStart, true, 2.6);
    const sideCenter = (terminalBackZ + terminalFrontZ) / 2;
    const sideLength = terminalFrontZ - terminalBackZ;
    wall(mesh, terminalEdge, sideCenter, sideLength, false, 2.52);
    const nearDoor = claimRoom.doorZ - claimRoom.doorWidth / 2;
    const farDoor = claimRoom.doorZ + claimRoom.doorWidth / 2;
    for (const [from, to] of [[terminalBackZ, nearDoor], [farDoor, terminalFrontZ]]) {
      wall(mesh, -terminalEdge, (from + to) / 2, to - from, false, 1.15);
    }
    const entranceHalfWidth = 9;
    const frontWall = (left, right) => wall(mesh, (left + right) / 2, terminalFrontZ, right - left, true, .72);
    frontWall(-terminalEdge, -entranceHalfWidth);
    frontWall(entranceHalfWidth, terminalEdge);

    for (const {x} of gates) {
      bridge(mesh, x);
      mesh.rect(x + .4, floor + .018, 11.8, 19.15, 5.45, "#a6b9b7");
      mesh.rect(x + .4, floor + .020, 14.36, 19.05, .11, "#e3e8d1");
      for (const dx of loungeBenches) {
        bench(mesh, x + dx, 10.25, "#628388");
        bench(mesh, x + dx, 12.8, "#55797d", -1);
      }
      boardingQueue(mesh, x);
      desk(mesh, x - 6.12, 9.28, teal);
      for (const z of [9.7, 14.1]) planter(mesh, x - 8.15, floor, z, 1.3);
      mesh.box(x - 6.12, floor + .94, 9.5, .09, 1.12, .09, frame);
      mesh.box(x - 6.12, floor + 1.8, 9.5, 1.5, .36, .14, ink);
      mesh.box(x - 6.12, floor + 1.89, 9.599, 1.22, .12, .06, paint);
    }

    for (const {x, z} of sharedBenches) bench(mesh, x, z, "#63836c");

    mesh.rect(-25, floor + .025, 22.9, 19.4, 7.7, "#c39569");
    for (let z = 19.2; z < 26.7; z += .34) mesh.rect(-25, floor + .029, z, 19.25, .027, "#ad825c");
    mesh.box(-25, floor, 19.05, 19.5, .74, .21, "#d5bb91");
    mesh.box(-25, floor + .74, 19.05, 19.55, .08, .28, "#eaddc3");
    mesh.box(-29.2, floor, 20.07, 8, .64, .86, "#8c6046");
    mesh.box(-29.2, floor + .63, 20.07, 8.06, .13, .98, "#f3e8cf");
    for (let i = 0; i < 7; i++) mesh.box(-32.6 + i * .51, floor + .76, 20.21, .26, .17, .28,
      ["#79614b", "#c88454", "#eee2bf"][i % 3]);
    for (const {x, z} of cafeTables) {
      mesh.ring(x, floor, z, .17, .14, .6, "#7b6853", 8);
      mesh.ring(x, floor + .6, z, .58, .58, .09, "#f0e8d5", 12);
      for (const dz of [-.91, .91]) {
        mesh.box(x, floor, z + dz, .49, .35, .47, "#8c6f52");
        mesh.box(x, floor + .27, z + dz * 1.18, .49, .34, .10, "#9f744b");
      }
    }
    planter(mesh, -15.8, floor, 26.1, 1.3);
    mesh.rect(-.8, floor + .022, (checkpointZ + 27.25) / 2, 22.4, 27.25 - checkpointZ, "#cbd8d1");
    securityCheckpoint(mesh);

    mesh.rect(24.75, floor + .024, (checkpointZ + 26.75) / 2, 21.7, 26.75 - checkpointZ, "#d4d9ce");
    checkInDesks.forEach((x, index) => desk(mesh, x, checkInQueue.deskZ, index % 2 ? "#87a5a2" : "#6c9b91"));
    for (const x of checkInQueue.centers) queue(mesh, x, checkInQueue);
    for (const x of [-34.5, -12.8, 12.4, 35.6]) planter(mesh, x, floor, 26.95, 1.3);

    return mesh;
  }

  function tree(mesh, x, z, s) {
    mesh.ring(x, 0, z, .13 * s, .095 * s, .95 * s, "#726e53", 6);
    mesh.ring(x, .64 * s, z, .53 * s, .82 * s, .48 * s, "#658366", 8);
    mesh.ring(x, 1.12 * s, z, .82 * s, .57 * s, .62 * s, "#779773", 8);
    mesh.ring(x, 1.74 * s, z, .57 * s, .14 * s, .77 * s, "#85a47f", 8);
  }

  function tower(mesh, x, z) {
    mesh.box(x, .015, z, 6.4, .23, 6.4, "#b7beb0");
    mesh.ring(x, .22, z, 2.48, 2.37, .6, "#c2cec4", 8);
    mesh.ring(x, .82, z, 1.58, 1.23, 6.72, "#b1c5bf", 8);
    mesh.box(x - 1.12, 1, z + .34, .10, 6.04, .51, "#759792");
    mesh.ring(x, 7.54, z, 1.42, 2.42, 1.13, "#a4b9b2", 8);
    mesh.ring(x, 8.67, z, 2.44, 2.44, .21, "#e4ebda", 8);
    mesh.ring(x, 8.88, z, 2.31, 2.5, 1.26, "#577f86", 8);
    for (let n = 0; n < 8; n++) {
      const angle = n * Math.PI / 4;
      mesh.box(x + 2.18 * Math.cos(angle), 8.91, z + 2.18 * Math.sin(angle), .085, 1.2, .09, "#a0b9b2");
    }
    mesh.ring(x, 10.14, z, 2.57, 2.46, .27, "#e3e9da", 8);
    mesh.ring(x, 10.41, z, .095, .065, 1.82, "#627578", 6);
    mesh.box(x, 11.79, z, 1.36, .11, .20, "#ca8062", .40);
  }

  function lamp(mesh, x, z, h, dual = false) {
    mesh.box(x, .025, z, .35, .21, .35, "#969e92");
    mesh.box(x, .2, z, .11, h, .11, frame);
    mesh.box(x, h + .16, z + (dual ? 0 : .36), .09, .12, dual ? 1.44 : .79, frame);
    mesh.box(x, h + .066, z + .72, .39, .15, .38, "#cbd8cb");
    if (dual) mesh.box(x, h + .066, z - .72, .39, .15, .38, "#cbd8cb");
  }

  function details() {
    const mesh = new Mesh();
    tower(mesh, -45.5, 1.4);
    for (const x of [-42, -13, 13, 42]) lamp(mesh, x, 7.45, 5.2, true);
    for (const x of [-41, -20, 0, 20, 41]) lamp(mesh, x, 39.9, 2.9);
    for (const x of roadsidePlanters) tree(mesh, x, 30.9, .72);
    for (let i = 0; i < 120; i++) {
      const x = -63 + random() * 126, z = -60 + random() * 116;
      const outside = (z < runwayZ - 8.5 && (x > 8 || x < -32)) || (z > 42 && (x < -47 || x > -4))
        || (x < -53 && z > -25) || (x > 48 && z < 29 && z > -18);
      if (outside) tree(mesh, x, z, .62 + random() * .89);
    }
    for (const x of [9, 16, 23, 30, 37]) tree(mesh, x, 45.8, .9);
    for (const {x} of gates) {
      for (const dx of [-7.8, -6.7, 6.6, 8]) {
        mesh.ring(x + dx, 0, 4.6 + (dx > 0 ? -.8 : 0), .22, .04, .44, "#d79050", 7);
      }
    }
    mesh.box(45.5, .02, 15, 6, .27, 8.9, "#b2b9ad");
    mesh.box(45.5, .29, 14.25, 4.9, 2.4, 6.35, "#a2bab4");
    mesh.box(45.5, 2.68, 14.25, 5.18, .25, 6.6, "#dce4d6");
    mesh.box(43.04, .32, 14.5, .055, 1.62, 3.63, "#627d80");
    mesh.box(45.5, .31, 17.43, 3.6, 1.66, .041, "#718c8d");
    for (let n = 0; n < 5; n++) mesh.box(45.5, .6 + n * .24, 17.46, 3.55, .055, .035, "#b6c7bc");
    return mesh;
  }

  function aircraft(livery) {
    const mesh = new Mesh();
    const body = "#f3f4e9", belly = "#bfced0", cabin = "#304f5e";
    const silver = "#cddbdc", rim = "#879ca4";
    const rings = [
      [-9, .10, .10, .16], [-8.25, .44, .43, .25], [-6.6, .94, .82, .11],
      [-4.8, 1.19, 1.11, 0], [5.1, 1.19, 1.11, 0], [6.9, 1.04, .98, -.12],
      [7.75, .78, .70, -.29], [8.48, .41, .42, -.39], [8.68, .09, .135, -.42]
    ];
    const sides = 24;
    const point = ([z, rx, ry, dy], a) => [rx * Math.cos(a), 1.73 + dy + ry * Math.sin(a), z];
    for (let i = 1; i < rings.length; i++) {
      for (let n = 0; n < sides; n++) {
        const a = n * 2 * Math.PI / sides, b = (n + 1) * 2 * Math.PI / sides;
        const steps = [point(rings[i - 1], a), point(rings[i - 1], b), point(rings[i], b), point(rings[i], a)];
        mesh.face(steps, n > 13 && n < 22 ? belly : body);
      }
    }
    for (const side of [-1, 1]) {
      const wing = [[side * .86, -.1], [side * 2.95, -.38], [side * 9.43, -5.16],
        [side * 9.2, -5.78], [side * 6.65, -5.12], [side * 1.06, -3.78]];
      mesh.flat(wing, 1.55, silver);
      for (let i = 1; i <= wing.length; i++) {
        const a = wing[i - 1], b = wing[i % wing.length];
        mesh.face([[a[0], 1.55, a[1]], [b[0], 1.55, b[1]], [b[0], 1.42, b[1]], [a[0], 1.42, a[1]]], rim);
      }
      mesh.face([[side * 9.02, 1.54, -5.02], [side * 9.38, 2.67, -5.43],
        [side * 9.66, 2.67, -5.99], [side * 9.18, 1.54, -5.75]], livery, [side * .6, .6, .17]);
      mesh.flat([[side * .24, -6.33], [side * 3.75, -8.39], [side * 3.71, -8.94],
        [side * .17, -8.43]], 2.03, silver);
      mesh.box(side * 3.0, 1.01, -.77, .43, .59, 1.51, "#a5b9bd");
      const u = side * 3.0;
      const tube = (r, a, z) => [u + r * Math.cos(a), 1.02 + r * Math.sin(a), z];
      for (let n = 0; n < 16; n++) {
        const a = n * Math.PI / 8, b = (n + 1) * Math.PI / 8;
        mesh.face([tube(.37, a, -2.05), tube(.37, b, -2.05), tube(.58, b, -.36), tube(.58, a, -.36)], body);
        mesh.face([tube(.58, a, -.36), tube(.58, b, -.36), tube(.52, b, .59), tube(.52, a, .59)], body);
        mesh.face([tube(.52, a, .59), tube(.52, b, .59), tube(.39, b, .61), tube(.39, a, .61)], rim, [0, 0, 1]);
      }
      mesh.face(Array.from({length: 16}, (_, n) => tube(.39, n * Math.PI / 8, .598)), "#293f49", [0, 0, 1]);
      mesh.box(side * .9, .10, -1.49, .28, .46, .43, ink);
      mesh.box(side * .9, .49, -1.49, .13, .51, .13, rim);

      for (let z = -5.1; z <= 5.27; z += .48) {
        const edge = side * (z < -4.7 ? 1.106 : 1.174);
        mesh.face([[edge, 1.89, z], [edge, 2.07, z], [edge, 2.085, z + .125],
          [edge, 1.9, z + .165]], cabin, [side, .13, 0]);
      }
      mesh.face([[side * 1.023, 2.08, 6.17], [side * .974, 2.28, 6.21],
        [side * .716, 2.19, 7.12], [side * .776, 1.94, 7.22]], cabin, [side, .3, .3]);
      mesh.face([[side * .08, 1.89, 7.74], [side * .08, 2.11, 7.42],
        [side * .663, 2.17, 7.17], [side * .726, 1.93, 7.34]], cabin, [side * .4, .4, .7]);
      mesh.face([[side * 1.21, 1.4, 3.66], [side * 1.21, 1.56, 3.66],
        [side * 1.19, 1.56, 5.36], [side * 1.156, 1.4, 5.36]], livery, [side, 0, 0]);
    }
    mesh.box(0, .10, 5.55, .24, .36, .37, ink);
    mesh.box(0, .43, 5.55, .12, .61, .12, rim);
    for (const side of [-1, 1]) {
      mesh.face([[side * .133, 2.01, -6.1], [side * .062, 5.64, -8.02],
        [side * .049, 5.57, -9.43], [side * .12, 1.97, -8.86]], livery, [side, .1, .07]);
      mesh.face([[side * .097, 3.16, -7.02], [side * .072, 4.73, -8.14],
        [side * .069, 4.71, -8.65], [side * .097, 3.17, -7.57]], "#e1eee2", [side, .1, .05]);
    }
    return mesh;
  }

  function vehicle(tint, truck = false) {
    const mesh = new Mesh();
    const length = truck ? 2.45 : 2.05;
    mesh.box(0, .18, 0, .99, .47, length, tint);
    mesh.box(0, .63, truck ? .58 : -.09, .88, truck ? .63 : .38, truck ? .92 : 1.02, "#799da3");
    mesh.box(0, truck ? 1.25 : 1.01, truck ? .58 : -.09, .91, .09, truck ? .94 : 1.04, tint);
    if (truck) mesh.box(0, .56, -.58, .94, .62, 1.1, "#b9c5bb");
    for (const side of [-1, 1]) {
      for (const z of [-.65, .65]) mesh.box(side * .46, .03, z, .18, .37, .36, "#293e42");
      mesh.box(side * .32, .46, length / 2, .16, .12, .025, "#ffffd8");
      mesh.box(side * .32, .47, -length / 2, .16, .10, .025, "#bd695e");
    }
    return mesh;
  }

  function baggageBelt() {
    const mesh = new Mesh();
    const drawBelt = (from, to) => {
      const [x, y, z] = from;
      const [nextX, nextY, nextZ] = to;
      const length = Math.hypot(nextX - x, nextZ - z);
      const dx = .29 * (nextZ - z) / length;
      const dz = .29 * (x - nextX) / length;
      const a = [x + dx, y - .02, z + dz], b = [x - dx, y - .02, z - dz];
      const c = [nextX - dx, nextY - .02, nextZ - dz], d = [nextX + dx, nextY - .02, nextZ + dz];
      const below = ([px, py, pz]) => [px, py - .095, pz];
      mesh.face([a, b, c, d], "#667b7a", [0, 1, 0]);
      mesh.face([a, d, below(d), below(a)], "#acb8ae");
      mesh.face([b, below(b), below(c), c], "#acb8ae");
    };
    const main = luggageFromDesk(checkInDesks[0]);
    for (let i = 2; i < main.length; i++) drawBelt(main[i - 1], main[i]);
    for (const x of checkInDesks) {
      const [deskTop, merge] = luggageFromDesk(x);
      drawBelt(deskTop, merge);
      mesh.box(merge[0], floor, merge[2], .23, .36, .4, "#9cab9e");
    }
    for (const z of [19.2, 15.6, 12, 8.1]) {
      const y = z >= 15.6 ? sortingBeltY : sortingBeltY + (baggageTransfer[1] - sortingBeltY) * (15.6 - z) / 7.5;
      mesh.box(baggageTransfer[0], .04, z, .36, y - .13, .37, "#9cab9e");
    }
    return mesh;
  }

  function suitcase(color) {
    return new Mesh().box(0, 0, 0, .47, .31, .52, color)
      .box(0, .31, 0, .46, .025, .105, "#a2aaa3")
      .box(0, .335, 0, .17, .053, .075, ink);
  }

  function baggageClaimWing() {
    const mesh = new Mesh();
    const {left, right, back, front, doorZ, doorWidth} = claimRoom;
    const x = (left + right) / 2;
    const z = (back + front) / 2;
    mesh.box(x, .031, z, right - left, .75, front - back, "#bdc9c1");
    mesh.box(x, .46, z, right - left + .24, .32, front - back + .24, "#ecede1");
    mesh.rect(x, floor + .025, z, right - left, front - back, "#d0dfdd");
    for (let tileZ = back + 1.35; tileZ < front - .2; tileZ += 1.35) {
      mesh.rect(x, floor + .027, tileZ, right - left, .028, "#aebfbc");
    }
    for (let tileX = left + 1.45; tileX < right - .2; tileX += 1.45) {
      mesh.rect(tileX, floor + .028, z, .028, front - back, "#aebfbc");
    }
    wall(mesh, left, z, front - back, false, 1.12);
    wall(mesh, x, back, right - left, true, 1.16);
    for (const edge of [doorZ - doorWidth / 2, doorZ + doorWidth / 2]) {
      mesh.box(right, floor, edge, .25, 1.47, .14, frame);
    }
    mesh.box(right, floor + 1.43, doorZ, .25, .16, doorWidth + .14, teal);

    const exitLeft = airsideExit.x - airsideExit.width / 2;
    const exitRight = airsideExit.x + airsideExit.width / 2;
    wall(mesh, (left + exitLeft) / 2, front, exitLeft - left, true, .72);
    wall(mesh, (exitRight + right) / 2, front, right - exitRight, true, .72);
    for (const x of [exitLeft, exitRight]) mesh.box(x, floor, front, .14, 1.15, .25, frame);
    mesh.box(airsideExit.x, floor + 1.02, front, airsideExit.width + .14, .13, .25, teal);
    mesh.face([[exitLeft, floor, front], [exitLeft, .04, airsideExit.z],
      [exitRight, .04, airsideExit.z], [exitRight, floor, front]], concrete, [0, 1, 0]);

    for (const seatZ of [15.32, 21.67]) {
      mesh.rect(-47.55, floor + .031, seatZ, 8.28, 1.42, "#cbbda4");
      bench(mesh, -49.35, seatZ, "#698c7e", -1);
      bench(mesh, -45.55, seatZ, "#557b88", -1);
      mesh.ring(-47.45, floor, seatZ, .16, .12, .35, frame, 8);
      mesh.ring(-47.45, floor + .35, seatZ, .41, .41, .075, "#e4cba1", 12);
      planter(mesh, -51.6, floor, seatZ, 1.35);
      planter(mesh, -43.6, floor, seatZ, .95);
    }
    planter(mesh, -51.4, floor, back + 1, 1.25);
    planter(mesh, -51.4, floor, front - 1, 1.25);
    return mesh;
  }

  function baggageCarousel({left, right, z, radius, height, loop, feed}, index) {
    const mesh = new Mesh();
    const centerX = (left + right) / 2;
    mesh.rect(centerX, floor + .032, z - .35, right - left + 2.5, 2.35, "#b9ceca");
    mesh.box(centerX, floor, z, right - left, .40, (radius + .36) * 2, "#a9bcb7");
    for (const x of [left, right]) mesh.ring(x, floor, z, radius + .36, radius + .36, .40, "#a9bcb7", 16);
    const outline = loop.map(([x, , z]) => [x, z]);
    mesh.path(outline, .72, height - .015, "#d3ddd5");
    mesh.path(outline, .58, height - .008, "#46595b");
    for (let x = left; x <= right; x += .26) {
      for (const edge of [-1, 1]) mesh.rect(x, height - .004, z + edge * radius, .024, .54, "#637779");
    }
    const [chute, foot] = feed;
    const feedZ = chute[2];
    mesh.box(chute[0] + .35, floor, feedZ, .82, .96, .96, "#7d9b96");
    mesh.box(chute[0] + .35, floor + .96, feedZ, .86, .07, 1, pale);
    mesh.face([[chute[0], chute[1] - .02, feedZ + .31], [chute[0], chute[1] - .02, feedZ - .31],
      [foot[0], foot[1] - .02, feedZ - .31], [foot[0], foot[1] - .02, feedZ + .31]], "#526769");
    mesh.rect((foot[0] + right) / 2, height - .012, feedZ, foot[0] - right, .58, "#526769");

    const digits = [[[-.14, -.12], [0, -.28], [0, .28]],
      [[-.18, -.28], [.18, -.28], [.18, -.02], [-.18, -.02], [-.18, .28], [.18, .28]],
      [[-.18, -.28], [.18, -.28], [.18, .28], [-.18, .28]]];
    const signZ = z + 1.55;
    mesh.rect(centerX, floor + .029, signZ, .83, .9, teal);
    mesh.path(digits[index].map(([x, z]) => [centerX + x, signZ + z]), .062, floor + .03, white);
    if (index === 2) mesh.line([centerX - .18, signZ], [centerX + .18, signZ], .062, floor + .03, white);
    return mesh;
  }

  function claimedSuitcase(color) {
    return new Mesh().box(-.28, .11, -.13, .23, .33, .18, color)
      .box(-.28, .44, -.13, .11, .055, .044, ink);
  }

  function baggageTrain() {
    const yellow = "#e7ab53";
    const tug = new Mesh().box(0, .18, 0, 1.2, .35, 1.85, yellow)
      .box(0, .53, -.26, .82, .23, .66, "#4b6c73")
      .box(0, .76, -.26, .86, .055, .7, yellow)
      .box(0, .2, -1.02, .25, .1, .31, ink);
    const trailer = new Mesh().box(0, .17, 0, 1.18, .26, 1.70, "#a78550")
      .box(0, .29, .96, .16, .11, .46, ink)
      .box(0, .29, -.96, .18, .11, .3, ink);
    for (const side of [-1, 1]) {
      for (const z of [-.57, .57]) {
        tug.box(side * .57, .02, z, .21, .34, .34, ink);
        trailer.box(side * .5, .02, z, .21, .32, .30, ink);
      }
      trailer.box(side * .55, .42, 0, .07, .17, 1.7, yellow);
    }
    return {tug, trailer};
  }

  function baggageLoader() {
    const [foot, hatch] = luggageToAircraft(0).slice(-2);
    const length = Math.hypot(hatch[0] - foot[0], hatch[2] - foot[2]);
    const yellow = "#e7ab53";
    const truck = new Mesh().box(0, .10, length / 2, 1.12, .16, length + .45, yellow)
      .box(.55, .26, length * .68, .46, .31, .59, "#4c6d75")
      .box(.55, .57, length * .68, .49, .07, .63, yellow)
      .box(0, .23, length * .72, .54, .49, .19, "#81918b");
    const lower = foot[1] - .022, upper = hatch[1] - .022;
    truck.face([[-.36, lower, 0], [-.36, upper, length], [.36, upper, length], [.36, lower, 0]], "#344e54");
    for (const side of [-1, 1]) {
      for (const z of [.23, length - .22]) truck.box(side * .54, .025, z, .19, .29, .32, ink);
      const x = side * .36;
      truck.face([[x, lower - .085, 0], [x, upper - .085, length], [x, upper + .095, length],
        [x, lower + .095, 0]], "#d3dcd2", [side, 0, 0]);
    }
    const roller = new Mesh().box(0, 0, 0, .69, .027, .068, "#7f9696");
    return {truck, roller};
  }

  const carryOnOffset = [.22, .02, -.12];

  function carryOn(mesh, tint, x = 0, y = 0, z = 0) {
    return mesh.box(x, y, z, .24, .26, .27, tint).box(x, y + .26, z, .10, .042, .055, ink);
  }

  function carryOnPosition(person) {
    const [x, y, z] = person.position;
    const [side, height, behind] = carryOnOffset;
    const c = Math.cos(person.angle), s = Math.sin(person.angle);
    return [x + side * c + behind * s, y + height, z - side * s + behind * c];
  }

  function traveler(tint, skin, stride = 0, withBag = true) {
    const mesh = new Mesh();
    mesh.ring(0, -.014, 0, .22, .22, .019, "#a8b2a9", 6);
    mesh.box(-.081, Math.max(0, stride) * .27, stride, .109, .31, .137, "#475458");
    mesh.box(.081, Math.max(0, -stride) * .27, -.01 - stride, .109, .32, .137, "#454f54");
    mesh.ring(0, .26, 0, .154, .205, .31, tint, 6);
    mesh.ring(0, .57, .013, .113, .111, .14, skin, 8);
    mesh.ring(0, .69, .005, .11, .08, .058, "#4d5146", 7);
    if (withBag) carryOn(mesh, tint, ...carryOnOffset);
    return mesh;
  }

  function seatedTraveler(tint, skin) {
    const mesh = new Mesh();
    for (const x of [-.085, .085]) {
      mesh.box(x, .29, .107, .12, .10, .29, "#475458");
      mesh.box(x, .025, .244, .10, .32, .13, "#475458");
      mesh.box(x, .018, .285, .12, .07, .18, "#3f4b50");
    }
    mesh.ring(0, .326, -.044, .15, .185, .191, tint, 6);
    mesh.ring(0, .516, -.03, .113, .111, .119, skin, 8);
    mesh.ring(0, .627, -.038, .11, .08, .047, "#4d5146", 7);
    carryOn(mesh, tint, .27, .01, -.17);
    return mesh;
  }

  const terminalPaths = {
    queueRows, queueSpacing, bridgePath, boardingPath, loungeSeats, sharedSeats, cafeSeats, cafeDoorX, airsideExit,
    checkIn: {...checkInQueue, desks: checkInDesks},
    security: securityQueue
  };

  function drawSecurityBag(moving, tray, mesh, person, now) {
    const {from, beltX, startAt, placedAt, scannedAt, pickupAt} = person.securityBag;
    const {surfaceY, entryZ, exitZ} = securityBelt;
    const trayHeight = .05;
    const loading = now < placedAt;
    const pickingUp = now >= pickupAt - .22;
    const progress = loading ? (now - startAt) / (placedAt - startAt)
      : pickingUp ? Math.min(1, (now - pickupAt + .22) / .22)
        : Math.min(1, (now - placedAt) / (scannedAt - placedAt));
    let position;
    if (loading || pickingUp) {
      const start = loading ? from : [beltX, surfaceY + trayHeight, exitZ];
      const end = loading ? [beltX, surfaceY + trayHeight, entryZ] : carryOnPosition(person);
      position = start.map((value, i) => value + (end[i] - value) * progress);
      position[1] += .12 * Math.sin(Math.PI * progress);
    } else {
      position = [beltX, surfaceY + trayHeight, entryZ + (exitZ - entryZ) * progress];
    }
    const [x, y, z] = position;
    if (!loading && !pickingUp) moving.push({mesh: tray, x, y: surfaceY, z, castShadow: false});
    moving.push({mesh, x, y, z, angle: loading || pickingUp ? person.angle : Math.PI, castShadow: false});
  }

  function passengerActors(outfits, occupancy, claimedLuggage, securityTray, now) {
    const moving = [];
    for (const {person, flight} of occupancy.visible) {
      const style = person.index * 5 + flight.airline * 3;
      const outfit = outfits[style % outfits.length];
      const walking = person.securityBag ? outfit.screening : outfit;
      const phase = person.distance / .72 % 1;
      const mesh = person.seated ? outfit.seated
        : person.moving ? walking.steps[Math.floor(phase * walking.steps.length)] : walking.idle;
      const [x, y, z] = person.position;
      const pose = {x, y, z, angle: person.angle, castShadow: false};
      moving.push({mesh, ...pose});
      if (person.securityBag) drawSecurityBag(moving, securityTray, outfit.carryOn, person, now);
      if (person.claimedBag !== undefined) moving.push({mesh: claimedLuggage[person.claimedBag], ...pose});
    }
    return moving;
  }

  function scene() {
    const fixed = [
      {mesh: ground(), castShadow: false},
      {mesh: terminal()},
      {mesh: baggageClaimWing()},
      {mesh: details()},
      {mesh: baggageBelt()},
      ...baggageClaim.carousels.map((carousel, index) => ({mesh: baggageCarousel(carousel, index)}))
    ];
    const cars = [
      vehicle("#7da5ad"),
      vehicle("#e0e4d6"), vehicle("#bb7e6c"), vehicle("#719692")
    ];
    const serviceVan = vehicle("#e4b260", true);
    const fleet = gates.map(({x}) => ({mesh: serviceVan, x: x - 8.8, z: -.4, angle: -.24}));
    for (let i = 0; i < 12; i++) {
      if (i % 4 !== 2) fleet.push({mesh: cars[i % cars.length], x: -42.6 + i * 2.6, z: 47.8, angle: Math.PI});
    }
    const traffic = Array.from({length: 5}, (_, i) => ({
      mesh: cars[i % cars.length], z: i < 3 ? 34.55 : 37.65, angle: (i < 3 ? 1 : -1) * Math.PI / 2,
      offset: i * 22
    }));
    const outfits = ["#b66e5e", "#4b807e", "#c9a354", "#ece1ce", "#556e89", "#81936c", "#906d81"]
      .map((tint, i) => {
        const skin = ["#e5b896", "#bb8462", "#d19d7c", "#99684f"][i % 4];
        const walking = withBag => ({idle: traveler(tint, skin, 0, withBag), steps: Array.from({length: 8}, (_, phase) =>
          traveler(tint, skin, Math.sin(phase * Math.PI / 4) * .15, withBag))});
        return {...walking(true), screening: walking(false), seated: seatedTraveler(tint, skin), carryOn: carryOn(new Mesh(), tint)};
      });
    const highlight = new Mesh().path([[-10.7, 5.45], [-10.7, -11.3], [-8.8, -15],
      [8.8, -15], [10.7, -11.3], [10.7, 5.45]], .23, .05, "#b6e0b3");
    const securityHighlight = new Mesh().ring(0, .036, 0, .31, .31, .018, "#89c995", 10);
    const securityTray = new Mesh().box(0, 0, 0, .62, .05, .56, "#b2c9c3");
    const luggage = baggageColors.map(suitcase);
    return {fixed: [...fixed, ...fleet], traffic, outfits, highlight, securityHighlight, securityTray, luggage,
      claimedLuggage: baggageColors.map(claimedSuitcase), baggageLoader: baggageLoader(), baggageTrain: baggageTrain()};
  }

  return {gates, aircraft, scene, passengerActors, carryOnPosition, terminalPaths, floor, runwayZ, taxiwayZ, luggageFromDesk, luggageToAircraft,
    baggageClaim, baggageColors};
})();
