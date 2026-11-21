"use strict";

(() => {
  const $ = selector => document.querySelector(selector);
  const {gates, road, floor} = airport;
  const currency = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 0});
  const laneCost = 12500;
  const startMinutes = 8 * 60 + 42;
  const planeIcon = '<svg class="icon" aria-hidden="true"><use href="#plane"/></svg>';
  const airlines = [
    {code: "PL", symbol: "#197f79", ui: "#8fd8ca"},
    {code: "SA", symbol: "#bd6d43", ui: "#efb08b"},
    {code: "PA", symbol: "#5674a7", ui: "#a4bfe9"},
    {code: "NR", symbol: "#8b698c", ui: "#d3a9d3"}
  ];
  const routes = [
    ["Melbourne", 214, 96], ["Brisbane", 507, 90], ["Auckland", 318, 110],
    ["Hobart", 126, 86], ["Adelaide", 435, 102], ["Wellington", 201, 94]
  ];
  function makeFlight(route, airline, stage, gate, initialPassengers) {
    const [destination, number, passengers] = routes[route];
    const manifest = initialPassengers ? passengerFlow.manifest(passengers, initialPassengers, "checkIn") : [];
    return {destination, id: airlines[airline].code + number, airline, passengers, stage, gate, manifest, nextBoarding: 0};
  }

  const state = {
    cash: 124500, now: 0, speed: 1, paused: false, dispatched: 0, lanes: 2,
    nextArrival: 0, nextRoute: 3,
    flights: [
      makeFlight(0, 0, "boarding", 0, {boarded: 68, gate: 28}),
      makeFlight(1, 1, "parked", 1, {gate: 24, concourse: 12, security: 38}),
      makeFlight(2, 2, "holding", null)
    ],
    selected: "SA507", stand: null, view: "flights", moving: null
  };
  const statusText = {
    parked: "At gate", boarding: "Boarding", ready: "Ready", holding: "Holding",
    inbound: "Taxiing in", outbound: "Departing"
  };
  const flow = passengerFlow.create(state.flights, state.lanes);
  let occupancy = passengerFlow.snapshot(state.flights);
  let occupancyDirty = false;

  let renderer, scene;
  let planes, laneClosed;
  try {
    renderer = world.createRenderer($("#scene"));
    scene = airport.scene();
    planes = airlines.map(airline => airport.aircraft(airline.symbol));
    laneClosed = new world.Mesh()
      .box(6.55, floor + .50, 22.36, 1.54, .07, .105, "#b97054")
      .box(5.83, floor, 22.36, .08, .56, .1, "#536b6c")
      .box(7.27, floor, 22.36, .08, .56, .1, "#536b6c");
  } catch (error) {
    console.error(error);
    $("#map-error").hidden = false;
  }

  function createLabel(text, x, y, z, section) {
    const label = document.createElement("span");
    label.className = "map-note";
    label.textContent = text;
    const count = section ? addMapCount(label) : null;
    $("#map-labels").append(label);
    return {element: label, x, y, z, count, section};
  }
  function addMapCount(label) {
    const count = document.createElement("span");
    count.className = "map-count";
    label.append(count);
    return count;
  }
  const mapPins = gates.map(({x, name}, gate) => {
    const button = document.createElement("button");
    button.className = "map-gate";
    button.type = "button";
    button.innerHTML = "<i aria-hidden='true'></i>" + name;
    const count = addMapCount(button);
    button.addEventListener("click", () => {
      const flight = state.flights.find(item => item.gate === gate);
      select(flight?.id || state.flights.find(item => item.stage === "holding")?.id || "gate-" + gate, gate);
    });
    if (renderer) $("#map-labels").append(button);
    return {element: button, x: x + 2.9, y: 2.85, z: 7.93, count};
  });
  const mapSigns = renderer ? [
    createLabel("TERMINAL 1", 0, 2.65, 31.4),
    createLabel("CAFÉ", -26, 2.53, 19.05),
    createLabel("SECURITY", -.7, 2.45, 20.2, "security"),
    createLabel("CHECK-IN", 25, 2.17, 19.45, "checkIn"),
    createLabel("WALKWAYS", 13.3, 1.65, 16.9, "concourse"),
    createLabel("RWY 09 / 27", -22, .05, -45.9)
  ] : [];
  $("#lounge-counts").innerHTML = gates.map(({name}) => stat(name, 0)).join("");

  function announce(message) {
    $("#event").textContent = message;
  }

  function select(id, stand = null) {
    state.selected = id;
    state.stand = stand;
    state.view = "flights";
    paint();
  }

  function notifyTab(view) {
    state.view = view;
    paint();
  }

  function availableGate() {
    return gates.findIndex((_, index) => !state.flights.some(flight => flight.gate === index));
  }

  function selectedGate() {
    const flight = state.flights.find(item => item.id === state.selected);
    if (flight?.gate != null) return flight.gate;
    if (flight?.stage === "holding") {
      return state.stand !== null && !state.flights.some(item => item.gate === state.stand)
        ? state.stand : availableGate();
    }
    return state.selected?.startsWith("gate-") ? Number(state.selected.slice(5)) : -1;
  }

  const flightElements = new Map();
  function paintFlights() {
    const active = new Set(state.flights.map(flight => flight.id));
    for (const [id, button] of flightElements) {
      if (!active.has(id)) {
        button.remove();
        flightElements.delete(id);
      }
    }
    for (const flight of state.flights) {
      let button = flightElements.get(flight.id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "flight";
        button.style.setProperty("--livery", airlines[flight.airline].ui);
        button.innerHTML = '<span class="airline-mark">' + planeIcon + '</span><span class="flight-name"><strong></strong><small></small></span><span class="flight-status"></span>';
        button.querySelector("strong").textContent = flight.destination;
        button.addEventListener("click", () => select(flight.id));
        $("#flight-list").append(button);
        flightElements.set(flight.id, button);
      }
      button.setAttribute("aria-pressed", String(flight.id === state.selected));
      button.querySelector("small").textContent = flight.id + " · " + (gates[flight.gate]?.name || "Arrival");
      const badge = button.querySelector(".flight-status");
      badge.dataset.stage = flight.stage;
      badge.textContent = statusText[flight.stage];
    }
    if (!state.flights.length) {
      if (!$("#empty-board")) {
        const message = document.createElement("p");
        message.className = "detail-copy";
        message.id = "empty-board";
        message.textContent = "Waiting for the next arrival.";
        $("#flight-list").append(message);
      }
    } else {
      $("#empty-board")?.remove();
    }
    const occupied = state.flights.filter(flight => flight.gate !== null).length;
    $("#gate-count").textContent = occupied + " / " + gates.length + " gates in use";
  }

  function progress(label, value, percentage) {
    return stat(label, value) + '<div class="detail-bar"><div style="width:' + percentage + '%"></div></div>';
  }

  function stat(label, value) {
    return '<div class="detail-stat"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  function paintDetail() {
    const flight = state.flights.find(item => item.id === state.selected);
    const gate = selectedGate();
    const panel = $("#flight-detail");
    const action = $("#flight-action");
    panel.hidden = !flight && gate < 0;
    if (panel.hidden) return;
    action.hidden = !flight;
    if (!flight) {
      $("#detail-kicker").textContent = "Gate " + gates[gate].name;
      $("#detail-title").textContent = "Stand available";
      $("#detail-content").innerHTML = '<p class="detail-copy">This gate can receive the next arrival.</p>';
      return;
    }
    const {stage, passengers, id, destination} = flight;
    const counts = occupancy.byFlight.get(id);
    $("#detail-kicker").textContent = (gates[flight.gate]?.name || "Inbound") + " / " + id;
    $("#detail-title").textContent = destination;
    if (stage === "holding") {
      $("#detail-content").innerHTML = '<p class="detail-copy">Aircraft holding short. Assign an open stand to bring it to the terminal.</p>';
    } else if (stage === "inbound") {
      $("#detail-content").innerHTML = '<p class="detail-copy">Taxiing to gate ' + gates[flight.gate].name + '.</p>';
    } else if (stage === "outbound") {
      $("#detail-content").innerHTML = '<p class="detail-copy">Aircraft cleared for runway 09.</p>';
    } else {
      const {boarded, boarding, gate: waiting} = counts;
      $("#detail-content").innerHTML = progress("Passengers boarded", boarded + " / " + passengers, boarded / passengers * 100) +
        '<div class="flow-stats">' + stat("Waiting at gate", waiting) +
        stat("On the way to the gate", passengers - waiting - boarding - boarded) +
        stat("Walking to aircraft", boarding) + '</div>';
    }
    const runwayBusy = Boolean(state.moving);
    const labels = {
      parked: "Start boarding", boarding: counts.gate || counts.boarding ? "Boarding in progress" : "Waiting for passengers",
      ready: runwayBusy ? "Airfield in use" : "Clear for departure",
      holding: gate < 0 ? "All gates occupied" : runwayBusy ? "Airfield in use" : "Assign gate " + gates[gate].name,
      inbound: "Taxiing to gate", outbound: "Departure in progress"
    };
    action.textContent = labels[stage];
    action.disabled = stage !== "parked" && !(stage === "ready" && !runwayBusy) &&
      !(stage === "holding" && gate >= 0 && !runwayBusy);
  }

  function paint() {
    if (occupancyDirty) {
      occupancy = passengerFlow.snapshot(state.flights);
      occupancyDirty = false;
      requestDraw = true;
    }
    const minutes = startMinutes + Math.floor(state.now / 3.4);
    const time = [Math.floor(minutes / 60) % 24, minutes % 60].map(num => String(num).padStart(2, "0")).join(":");
    const satisfaction = Math.min(100, Math.max(55, 84 + state.dispatched * 2 + (state.lanes - 2) * 4 - Math.floor((occupancy.security.length - 38) / 16)));
    $("#cash").textContent = currency.format(state.cash);
    $("#passengers").textContent = occupancy.total;
    $("#satisfaction").textContent = satisfaction + "%";
    $(".clock-day").textContent = "DAY " + String(1 + Math.floor(minutes / 1440)).padStart(2, "0");
    $("#clock").textContent = time;
    $("#clock").setAttribute("datetime", time);
    $("#run-label").textContent = state.paused ? "Paused" : "Running";
    $("#run-label").classList.toggle("paused", state.paused);
    $("#pause-icon").setAttribute("href", state.paused ? "#play" : "#pause");
    $("#pause-toggle").setAttribute("aria-label", state.paused ? "Resume simulation" : "Pause simulation");
    document.querySelectorAll("[data-speed]").forEach(button => button.setAttribute("aria-pressed", String(!state.paused && state.speed === Number(button.dataset.speed))));
    const terminalOpen = state.view === "terminal";
    $("#terminal-tab").setAttribute("aria-pressed", String(terminalOpen));
    $("#flights-tab").setAttribute("aria-pressed", String(!terminalOpen));
    $("#terminal-view").hidden = !terminalOpen;
    $("#flight-view").hidden = terminalOpen;
    paintFlights();
    paintDetail();
    if (terminalOpen) {
      $("#check-in-count").textContent = occupancy.checkIn.length;
      $("#security-count").textContent = occupancy.security.length;
      $("#concourse-count").textContent = occupancy.concourse.length;
      $("#boarding-count").textContent = occupancy.boarding.length;
      $("#lanes-count").textContent = state.lanes + " / 3";
      $("#lounge-counts").querySelectorAll("b").forEach((count, index) => {
        count.textContent = occupancy.gates[index].length;
      });
      const upgrade = $("#upgrade");
      upgrade.disabled = state.lanes === 3 || state.cash < laneCost;
      upgrade.innerHTML = state.lanes === 3 ? "All lanes open" : "Open a lane <span>" + currency.format(laneCost) + "</span>";
    }
    const goal = Math.min(state.dispatched, 2);
    $("#goal-bar").style.width = goal * 50 + "%";
    $("#goal-count").textContent = goal + " / 2";
    $("#objective-title").textContent = goal === 2 ? "Shift objective complete" : "Dispatch 2 aircraft";

    const gate = selectedGate();
    mapPins.forEach(({element, count}, index) => {
      const flight = state.flights.find(item => item.gate === index);
      const waiting = occupancy.gates[index].length;
      count.textContent = waiting;
      element.dataset.state = flight?.stage || "free";
      element.setAttribute("aria-pressed", String(gate === index));
      element.setAttribute("aria-label", "Gate " + gates[index].name + ", " +
        (flight ? statusText[flight.stage] : "available") + ", " + waiting + " waiting");
    });
    for (const {count, section} of mapSigns) {
      if (count) count.textContent = occupancy[section].length;
    }
  }

  function positionPath(flight) {
    const x = gates[flight.gate].x;
    const halfTurn = Math.PI / 2;
    if (flight.stage === "inbound") {
      return [
        [0, 44, -23.2, -halfTurn], [.17, 37, -23.2, -halfTurn],
        [.48, x + 6, -23.2, -halfTurn], [.61, x + 1.8, -21.2, -.77],
        [.73, x, -17, 0], [1, x, -4.75, 0]
      ];
    }
    return [
      [0, x, -4.75, 0], [.20, x, -15, 0], [.30, x - 2.1, -22, -halfTurn],
      [.48, -39.7, -23.2, -halfTurn], [.56, -45, -25.5, -2.3],
      [.65, -45, -32.7, Math.PI], [.73, -40.4, road, halfTurn],
      [.91, 36, road, halfTurn], [1, 71, road, halfTurn, 16, .23]
    ];
  }

  function aircraftPosition(flight) {
    if (flight.stage === "holding") return {x: 44, z: -23.2, angle: -Math.PI / 2};
    if (state.moving?.flight !== flight) return {x: gates[flight.gate].x, z: -4.75};
    const {start, duration, path} = state.moving;
    const fraction = Math.min(1, (state.now - start) / duration);
    const end = path.findIndex((point, i) => i > 0 && point[0] >= fraction);
    const a = path[end - 1], b = path[end];
    const t = (fraction - a[0]) / (b[0] - a[0]);
    const mix = index => (a[index] || 0) + ((b[index] || 0) - (a[index] || 0)) * t;
    const arc = Math.atan2(Math.sin(b[3] - a[3]), Math.cos(b[3] - a[3]));
    return {x: mix(1), z: mix(2), angle: a[3] + arc * t, y: mix(4), pitch: mix(5)};
  }

  function command() {
    const flight = state.flights.find(item => item.id === state.selected);
    if (!flight || $("#flight-action").disabled) return;
    if (flight.stage === "parked") {
      flight.stage = "boarding";
      announce("Boarding started at " + gates[flight.gate].name + ".");
    } else if (flight.stage === "ready") {
      flight.stage = "outbound";
      state.moving = {flight, start: state.now, duration: 20, path: positionPath(flight)};
      announce(flight.id + " cleared for departure.");
    } else if (flight.stage === "holding") {
      flight.gate = selectedGate();
      flight.stage = "inbound";
      state.moving = {flight, start: state.now, duration: 12, path: positionPath(flight)};
      announce(flight.id + " taxiing to " + gates[flight.gate].name + ".");
    }
    paint();
  }

  function update(dt) {
    if (state.paused) return;
    const simDelta = dt * state.speed;
    state.now += simDelta;
    const changed = passengerFlow.advance(state.flights, flow, state.now, simDelta, state.lanes,
      flight => {
        flight.stage = "ready";
        announce(flight.id + " is ready for departure.");
      });
    occupancyDirty ||= changed;
    if (state.moving && state.now >= state.moving.start + state.moving.duration) {
      const {flight} = state.moving;
      state.moving = null;
      occupancyDirty = true;
      if (flight.stage === "inbound") {
        flight.stage = "parked";
        flight.manifest = passengerFlow.manifest(flight.passengers);
        announce(flight.id + " parked at " + gates[flight.gate].name + ".");
        state.nextArrival = state.now + 18;
      } else {
        const income = 3800 + flight.passengers * 41;
        const completed = ++state.dispatched === 2;
        state.cash += income + (completed ? 10000 : 0);
        state.flights = state.flights.filter(item => item !== flight);
        if (state.selected === flight.id) state.selected = state.flights[0]?.id || "gate-" + flight.gate;
        announce(completed ? "Shift complete. $10,000 bonus earned." : flight.id + " airborne. " + currency.format(income) + " earned.");
      }
    }
    if (state.now > state.nextArrival && availableGate() >= 0 &&
      !state.flights.some(flight => flight.stage === "holding" || flight.stage === "inbound")) {
      let route, airline;
      do {
        route = state.nextRoute % routes.length;
        airline = state.nextRoute++ % airlines.length;
      } while (state.flights.some(flight => flight.destination === routes[route][0]));
      const flight = makeFlight(route, airline, "holding", null);
      state.flights.push(flight);
      occupancyDirty = true;
      announce(flight.id + " holding short for a gate assignment.");
    }
  }

  function draw() {
    if (!renderer) return;
    const moving = state.flights.map(flight => ({mesh: planes[flight.airline], ...aircraftPosition(flight)}));
    const carTravel = state.now * 2.4;
    for (const vehicle of scene.traffic) {
      const direction = Math.sign(vehicle.angle);
      const x = ((vehicle.offset + carTravel) % 110 - 55) * direction;
      moving.push({...vehicle, x});
    }
    const people = airport.passengerActors(scene.outfits, occupancy);
    if (state.lanes === 2) moving.push({mesh: laneClosed});
    const gate = gates[selectedGate()];
    if (gate) moving.push({mesh: scene.highlight, x: gate.x, castShadow: false});
    renderer.render([...scene.fixed, ...moving, ...people]);
    for (const {x, y, z, element} of [...mapPins, ...mapSigns]) {
      const [left, top] = renderer.project(x, y, z);
      element.style.left = left + "px";
      element.style.top = top + "px";
      element.hidden = left < 18 || top < 19 || left > renderer.view.width - 18 || top > renderer.view.height - 18 ||
        (element.className === "map-note" && renderer.view.width < 520);
    }
  }

  function togglePause() {
    state.paused = !state.paused;
    paint();
  }

  $("#flights-tab").addEventListener("click", () => notifyTab("flights"));
  $("#terminal-tab").addEventListener("click", () => notifyTab("terminal"));
  $("#flight-action").addEventListener("click", command);
  $("#pause-toggle").addEventListener("click", togglePause);
  $("#upgrade").addEventListener("click", () => {
    if (state.lanes !== 2 || state.cash < laneCost) return;
    state.lanes++;
    state.cash -= laneCost;
    announce("Security lane 3 is now open.");
    paint();
  });
  document.querySelectorAll("[data-speed]").forEach(button => {
    button.addEventListener("click", () => {
      state.speed = Number(button.dataset.speed);
      state.paused = false;
      paint();
    });
  });
  function zoom(factor, anchor) {
    if (!renderer) return;
    const {view} = renderer;
    const next = Math.max(.65, Math.min(2.7, view.zoom * factor));
    if (anchor) {
      const multiplier = next / view.zoom - 1;
      view.x += (view.width * .495 + view.x - anchor[0]) * multiplier;
      view.y += (view.height * .51 + view.y - anchor[1]) * multiplier;
    }
    view.zoom = next;
    requestDraw = true;
  }
  function fit() {
    if (renderer) Object.assign(renderer.view, {zoom: 1, x: 0, y: 0});
    requestDraw = true;
  }
  $("#zoom-in").addEventListener("click", () => zoom(1.22));
  $("#zoom-out").addEventListener("click", () => zoom(1 / 1.22));
  $("#reset-view").addEventListener("click", fit);
  const canvas = $("#scene");
  if (renderer) {
    canvas.addEventListener("wheel", event => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoom(Math.exp(-Math.max(-72, Math.min(72, event.deltaY)) * .003), [event.clientX - rect.left, event.clientY - rect.top]);
    }, {passive: false});
    let pointer = null;
    canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0 || pointer) return;
      pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
      if (pointer?.id !== event.pointerId) return;
      const {view} = renderer;
      view.x = Math.max(-view.width * 1.5, Math.min(view.width * 1.5, view.x + event.clientX - pointer.x));
      view.y = Math.max(-view.height * 1.5, Math.min(view.height * 1.5, view.y + event.clientY - pointer.y));
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      requestDraw = true;
    });
    canvas.addEventListener("lostpointercapture", event => {
      if (pointer?.id === event.pointerId) pointer = null;
    });
  }
  window.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.code === "Space" && !["BUTTON", "INPUT", "TEXTAREA"].includes(event.target.tagName)) {
      event.preventDefault();
      togglePause();
    }
    if (event.key === "+" || event.key === "=") zoom(1.22);
    if (event.key === "-") zoom(1 / 1.22);
    if (event.key === "0") fit();
  });
  let requestDraw = true;
  let lastFrame = performance.now(), lastPaint = 0, lastDraw = 0;
  window.addEventListener("resize", () => { requestDraw = true; });
  function frame(timestamp) {
    update(Math.max(0, Math.min(.15, (timestamp - lastFrame) / 1000)));
    lastFrame = timestamp;
    const drawDue = requestDraw || (!state.paused && timestamp - lastDraw >= 32);
    if ((drawDue || !renderer) && (occupancyDirty || (!state.paused && timestamp - lastPaint > 160))) {
      paint();
      lastPaint = timestamp;
    }
    if (drawDue) {
      draw();
      lastDraw = timestamp;
      requestDraw = false;
    }
    requestAnimationFrame(frame);
  }
  // Updating the scene once on paused commands keeps gate highlights and the checkpoint in sync.
  document.addEventListener("click", () => { requestDraw = true; });
  paint();
  requestAnimationFrame(frame);
})();
