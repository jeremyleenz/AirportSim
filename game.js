"use strict";

(() => {
  const $ = selector => document.querySelector(selector);
  const {gates, runwayZ, taxiwayZ, floor} = airport;
  const baggageCarousels = airport.baggageClaim.carousels;
  const mobileLayout = window.matchMedia("(max-width: 760px), (pointer: coarse) and (max-height: 500px)");
  const game = $(".game");
  const currency = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 0});
  const startingCash = 124500;
  const progressKey = "airport-ops-opening-v1";
  const staffingRates = {checkIn: 10, security: 15};
  const counterNames = {checkIn: "Check-in station", security: "Security lane"};
  const counterStatus = {open: "Open", closing: "Closing", closed: "Closed"};
  const handlingCost = 2000;
  const passengerFare = 41;
  const startMinutes = 8 * 60 + 42;
  const secondsPerMinute = 3.4;
  const curfewMinutes = 19 * 60;
  const curfewAt = (curfewMinutes - startMinutes) * secondsPerMinute;
  const curfewWarningMinutes = 30;
  const curfewUrgentMinutes = 10;
  const fastForwardSpeed = 4;
  const scheduleVariationMinutes = 6;
  const boardingLeadMinutes = 40;
  const largeFlightBoardingLeadMinutes = 45;
  const largeFlightCapacity = 110;
  const earliestPassengerArrival = 70;
  const latestPassengerArrival = 40;
  const lateNoticeMinutes = 12;
  const takeoffWarningMinutes = 10;
  const pushbackWarningMinutes = 5;
  const flightReminderSeconds = 9;
  const departureGraceMinutes = 5;
  const finePerLateMinute = 25;
  const severeDelayMinutes = 30;
  const finePerSevereLateMinute = 75;
  const baggageWaitGraceMinutes = 25;
  const baggageDelaysPerSatisfactionPoint = 15;
  const maxBaggageSatisfactionLoss = 6;
  const taxiSpeed = 4;
  const pushbackSpeed = 2.5;
  const taxiSeparation = 24;
  const holdingPosition = {x: 44, z: taxiwayZ, angle: -Math.PI / 2};
  const planeIcon = '<svg class="icon" aria-hidden="true"><use href="#plane"/></svg>';
  const airlines = [
    {code: "PL", symbol: "#197f79", ui: "#8fd8ca"},
    {code: "SA", symbol: "#bd6d43", ui: "#efb08b"},
    {code: "PA", symbol: "#5674a7", ui: "#a4bfe9"},
    {code: "NR", symbol: "#8b698c", ui: "#d3a9d3"}
  ];
  const routes = [
    ["Melbourne", 96], ["Brisbane", 90], ["Auckland", 110],
    ["Hobart", 86], ["Adelaide", 102], ["Wellington", 94]
  ];
  // Times are minutes after opening. Overnight aircraft operate the first departures.
  const scheduleSlots = [
    [0, 0, 214, 4, 74], [1, 1, 507, 10, 119], [2, 2, 318, 86, 155],
    [3, 3, 126, 132, 199], [5, 1, 201, 162, 236], [0, 2, 216, 211, 281],
    [1, 3, 509, 248, 320], [2, 0, 320, 290, 365], [3, 1, 128, 332, 404],
    [4, 2, 437, 374, 449], [5, 3, 203, 419, 493], [0, 0, 218, 463, 533]
  ];
  const overnightArrivalCounts = [2, 1, 0, 1];
  const overnightArrivalSlots = [[5, 0, 702, 28], [4, 2, 704, 14]];

  function createTimetable(day, overnightAircraft, random) {
    const departures = scheduleSlots.map(([route, airline, number, arrivalMinute, takeoffMinute], index) => {
      const [destination, passengers] = routes[route];
      const overnight = overnightAircraft[index];
      const aircraft = overnight?.aircraft ?? {airline};
      // Offset arrival and takeoff together to preserve each flight's turnaround time.
      const offset = index < 2 ? 0 : Math.floor(random() * (2 * scheduleVariationMinutes + 1)) - scheduleVariationMinutes;
      const arrivalAt = overnight ? null : (arrivalMinute + offset) * secondsPerMinute;
      const departureMinute = takeoffMinute + offset;
      const lead = passengers >= largeFlightCapacity ? largeFlightBoardingLeadMinutes : boardingLeadMinutes;
      const boardingAt = Math.max(0, departureMinute - lead) * secondsPerMinute;
      const takeoffAt = departureMinute * secondsPerMinute;
      return {id: airlines[aircraft.airline].code + number, destination, airline: aircraft.airline, aircraft,
        openingGate: overnight?.gate ?? null, passengers, arrivalAt, boardingAt, takeoffAt};
    }).sort((a, b) => a.takeoffAt - b.takeoffAt);
    const finalTakeoff = departures.at(-1).takeoffAt;
    const count = Math.min(gates.length, overnightArrivalCounts[(day - 1) % overnightArrivalCounts.length]);
    const eveningArrivals = overnightArrivalSlots.slice(0, count).map(([route, airline, number, lead]) => {
      const [destination, passengers] = routes[route];
      return {id: airlines[airline].code + number, destination, airline, aircraft: {airline},
        openingGate: null, passengers, arrivalAt: finalTakeoff - lead * secondsPerMinute, boardingAt: null, takeoffAt: null};
    });
    return [...departures, ...eveningArrivals];
  }

  function lateArrivalTimes(takeoffAt, random) {
    if (random() >= .25) return [];
    const count = 1 + Math.floor(random() * 8);
    return Array.from({length: count}, () => {
      const timing = random();
      const [earliest, latest] = timing < .7 ? [-26, -12] : timing < .9 ? [-12, -1] : [0, 7];
      const first = Math.max(earliest, -takeoffAt / secondsPerMinute);
      return takeoffAt + (first + (latest - first) * random()) * secondsPerMinute;
    }).sort((a, b) => a - b);
  }

  function makeFlight(plan, index, random) {
    const {arrivalAt, takeoffAt, openingGate: gate} = plan;
    const stage = gate === null ? "scheduled" : "parked";
    const incomingPassengers = arrivalAt === null ? 0 : Math.round(plan.passengers * (.55 + index * 3 % 5 * .04));
    const passengers = isOvernightArrival(plan) ? 0 : plan.passengers;
    let manifest = [];
    if (passengers) {
      const lateTimes = lateArrivalTimes(takeoffAt, random);
      const firstArrival = gate !== null && index === 0 ? 0 : Math.max(0, takeoffAt - earliestPassengerArrival * secondsPerMinute);
      const lastArrival = Math.max(0, takeoffAt - latestPassengerArrival * secondsPerMinute);
      manifest = passengerFlow.manifest(passengers, firstArrival, lastArrival, lateTimes);
      for (const person of manifest) person.flightId = plan.id;
    }
    return {...plan, passengers, stage, gate, carousel: null, manifest, incomingPassengers};
  }

  function newShiftSeed() {
    return Math.floor(Math.random() * 2 ** 32);
  }

  function createShift(day, overnightAircraft, openingCash = startingCash, seed = newShiftSeed()) {
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const timetable = createTimetable(day, overnightAircraft, random);
    const departureCount = timetable.filter(plan => !isOvernightArrival(plan)).length;
    return {day, openingCash, cash: openingCash, now: 0, playTime: 0, speed: 1, paused: false, closedAtCurfew: false,
      missedPassengers: 0, delayMinutes: 0, staffingCosts: {checkIn: 0, security: 0},
      timetable, departureCount, flights: timetable.map((plan, index) => makeFlight(plan, index, random)),
      results: [], selected: overnightAircraft.length ? timetable[0].id : null,
      view: "flights", terminalFocus: null, gateFromMap: null,
      movements: new Map(), taxiQueue: [], nextDeparture: null, luggage: baggage.create(baggageWaitGraceMinutes * secondsPerMinute)};
  }

  let savedOpeningText = null;
  function loadOpening() {
    try {
      savedOpeningText = window.localStorage.getItem(progressKey);
      const saved = JSON.parse(savedOpeningText);
      if (!saved) return null;
      const {day, cash, seed, parked} = saved;
      if (!Number.isSafeInteger(day) || day < 1 || !Number.isSafeInteger(cash) ||
          !Number.isInteger(seed) || seed < 0 || seed >= 2 ** 32 || !Array.isArray(parked)) return null;
      const overnightAircraft = parked.map(({gate: gateName, airline: code}) => ({
        gate: gates.findIndex(({name}) => name === gateName),
        aircraft: {airline: airlines.findIndex(({code: airlineCode}) => airlineCode === code)}
      }));
      if (overnightAircraft.some(({gate, aircraft}) => gate < 0 || aircraft.airline < 0) ||
          new Set(overnightAircraft.map(({gate}) => gate)).size !== overnightAircraft.length) return null;
      return {day, cash, seed, overnightAircraft};
    } catch {
      return null;
    }
  }

  function saveOpening({day, cash, seed, overnightAircraft}) {
    const parked = overnightAircraft.map(({gate, aircraft}) => ({gate: gates[gate].name, airline: airlines[aircraft.airline].code}));
    try {
      const storage = window.localStorage;
      // A shift in an older tab must not overwrite progress saved since it opened.
      if (storage.getItem(progressKey) !== savedOpeningText) return false;
      const checkpoint = JSON.stringify({day, cash, seed, parked});
      storage.setItem(progressKey, checkpoint);
      savedOpeningText = checkpoint;
      return true;
    } catch {
      return false;
    }
  }

  const savedOpening = loadOpening();
  let state = savedOpening
    ? createShift(savedOpening.day, savedOpening.overnightAircraft, savedOpening.cash, savedOpening.seed)
    : createShift(1, [{gate: 0, aircraft: {airline: 0}}]);
  if (savedOpening) state.paused = true;
  let nextOpening = null;
  let openingSaved = false;
  let mapAction = null;
  const statusText = {
    scheduled: "Expected",
    parked: "At gate", deplaning: "Deplaning", boarding: "Boarding", closing: "Boarding closed", ready: "Ready", holding: "Holding",
    reserved: "Gate reserved", inbound: "Taxiing in", outbound: "Departing", overnight: "Parked overnight"
  };
  let flow = passengerFlow.create();
  let occupancy = passengerFlow.snapshot(state.flights, flow);
  let occupancyDirty = false;

  let renderer, scene;
  let planes, counterMarkers;
  try {
    renderer = world.createRenderer($("#scene"));
    scene = airport.scene();
    planes = airlines.map(airline => airport.aircraft(airline.symbol));
    const {checkIn, security} = airport.terminalPaths;
    counterMarkers = {
      checkIn: queueEntranceMarkers(checkIn),
      security: queueEntranceMarkers(security)
    };
  } catch (error) {
    console.error(error);
    $("#map-error").hidden = false;
  }

  function queueEntranceMarkers({width, front}) {
    const {queueRows, queueSpacing} = airport.terminalPaths;
    const z = front + (queueRows - 1) * queueSpacing + .48;
    const y = floor + .035;
    const paint = "#f9f2e1";
    const pad = color => new world.Mesh().rect(0, y, z, width - .12, 1.25, color);
    const open = pad("#377e57")
      .line([0, z + .39], [0, z - .37], .2, y + .003, paint)
      .path([[-.62, z + .08], [0, z - .37], [.62, z + .08]], .2, y + .003, paint);
    const closing = pad("#a4722f").rect(0, y + .003, z, 1.32, .24, paint);
    const closed = pad("#8c4a46")
      .box(0, floor + .46, z, width, .30, .19, "#c35f54")
      .box(-width / 2, floor, z, .14, .79, .19, "#536b6c")
      .box(width / 2, floor, z, .14, .79, .19, "#536b6c");
    for (const fraction of [-.36, -.12, .12, .36]) {
      closed.box(width * fraction, floor + .46, z, width * .10, .30, .20, paint);
    }
    return {open, closing, closed};
  }

  function createLabel(text, x, y, z, section) {
    const staffing = Object.hasOwn(staffingRates, section);
    const claim = section === "baggageClaim";
    const shortcut = staffing || claim;
    const label = document.createElement(shortcut ? "button" : "span");
    label.className = "map-note";
    let content = label;
    if (shortcut) {
      label.type = "button";
      label.classList.add("map-shortcut");
      content = document.createElement("span");
      content.className = "map-chip";
      label.append(content);
    }
    content.textContent = text;
    const count = section ? addMapCount(content) : null;
    if (staffing) {
      label.dataset.staffingType = section;
      label.setAttribute("aria-controls", "staffing-" + section);
      label.title = "Open " + text.toLowerCase() + " staffing controls";
      label.addEventListener("click", () => revealStaffing(section));
    }
    if (claim) {
      const name = document.createElement("span");
      name.className = "claim-map-name";
      name.textContent = text;
      const shortName = document.createElement("span");
      shortName.className = "claim-map-short-name";
      shortName.textContent = "BAGS";
      content.replaceChildren(name, shortName, count);
      label.setAttribute("aria-controls", "baggage-claim");
      label.addEventListener("click", () => revealBaggageClaim(true));
    }
    $("#map-labels").append(label);
    return {element: label, x, y, z, count, section, decorative: !shortcut};
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
    button.innerHTML = '<span class="map-chip"><i aria-hidden="true"></i><span><span class="map-gate-info">' + name +
      '</span><span class="map-late-time" hidden></span></span></span>';
    const count = addMapCount(button.querySelector(".map-gate-info"));
    const late = button.querySelector(".map-late-time");
    button.addEventListener("click", () => {
      const flight = flightAtGate(gate);
      const arrivals = state.flights.filter(item => item.stage === "holding");
      const arrival = arrivals.find(item => item.id === state.selected) || arrivals[0];
      selectFromMap(flight?.id || arrival?.id || "gate-" + gate, flight ? null : gate);
    });
    if (renderer) $("#map-labels").append(button);
    return {element: button, x: x + 2.9, y: 2.85, z: 7.93, count, late};
  });
  const mapSigns = renderer ? [
    createLabel("ENTRANCE", -2.2, 1.1, 34.1),
    createLabel("ARRIVALS EXIT", airport.terminalPaths.airsideExit.x, 1.2, airport.terminalPaths.airsideExit.z + 3.45),
    createLabel("BAGGAGE CLAIM", ...airport.baggageClaim.label, "baggageClaim"),
    createLabel("CAFÉ", -26, 1.84, 19.05, "cafe"),
    createLabel("SHARED SEATS", airport.terminalPaths.sharedSeats[1].position[0], 1, 16.55, "sharedSeats"),
    ...(airport.terminalPaths.restroomLabel ? [createLabel("TOILETS", ...airport.terminalPaths.restroomLabel)] : []),
    createLabel("SECURITY", bankCenter("security"), 2.75, airport.terminalPaths.security.exitZ, "security"),
    createLabel("CHECK-IN", bankCenter("checkIn"), 4.6, airport.terminalPaths.checkIn.deskZ, "checkIn"),
    createLabel("DEPARTURES", 1.7, 1.65, 15.55, "concourse"),
    createLabel("RWY 09 / 27", -22, .05, runwayZ - 9.4)
  ] : [];
  function bankCenter(type) {
    const {banks} = airport.terminalPaths[type];
    return banks.reduce((sum, {x}) => sum + x, 0) / banks.length;
  }
  const holdingPin = $("#map-holding");
  const holdingPinRoute = holdingPin.querySelector(".holding-route");
  const holdingPinSchedule = holdingPin.querySelector(".holding-time");
  const holdingPinTime = holdingPinSchedule.querySelector("time");
  const holdingPinLate = holdingPin.querySelector(".map-late-time");
  const holdingPinCount = holdingPin.querySelector(".holding-count");
  const holdingPinPosition = {element: holdingPin, x: holdingPosition.x, y: 6.4, z: holdingPosition.z};
  holdingPin.addEventListener("click", () => {
    const flight = flightAtHoldingPoint();
    if (flight) selectFromMap(flight.id);
  });
  $("#lounge-counts").innerHTML = gates.map(({name}) => stat(name, 0)).join("");

  function announce(message) {
    $("#event").textContent = message;
  }

  function select(id, gateFromMap = null) {
    mapAction = null;
    state.selected = id;
    state.gateFromMap = gateFromMap;
    state.view = "flights";
    state.terminalFocus = null;
    paint();
    requestDraw = true;
  }

  function showMobileView(view) {
    mapAction = null;
    game.dataset.mobileView = view;
    $("#show-map").setAttribute("aria-pressed", String(view === "map"));
    $("#show-operations").setAttribute("aria-pressed", String(view === "operations"));
    requestDraw = true;
  }

  function openOperationsFromMap(kind, target) {
    if (!mobileLayout.matches) return;
    showMobileView("operations");
    mapAction = {kind, target};
  }

  function returnToMapAfter(kind, target) {
    if (!mobileLayout.matches || mapAction?.kind !== kind || mapAction.target !== target) return;
    showMobileView("map");
    $("#show-map").focus({preventScroll: true});
  }

  function revealFlight(focus = true) {
    const entry = flightElements.get(state.selected);
    (entry?.card ?? flightDetail).scrollIntoView({block: "nearest"});
    if (mobileLayout.matches && entry) {
      const preferred = gateOptions[state.gateFromMap]?.button;
      const gateChoice = gatePicker.hidden ? null
        : preferred && !preferred.disabled ? preferred : gatePicker.querySelector("button:enabled");
      const action = gateChoice ?? (focus ? flightDetail.querySelector("button:not([hidden]):enabled") : null);
      if (action) {
        (gateChoice ? gatePicker : action).scrollIntoView({block: "nearest"});
        if (focus) action.focus({preventScroll: true});
        return;
      }
    }
    if (focus) (entry?.button ?? $("#stand-title")).focus({preventScroll: true});
  }

  function selectFromMap(id, stand = null) {
    if (shiftComplete()) return;
    select(id, stand);
    openOperationsFromMap("flight", id);
    revealFlight(mobileLayout.matches);
  }

  function notifyTab(view, terminalFocus = null) {
    mapAction = null;
    state.gateFromMap = null;
    if (state.view !== view || state.terminalFocus !== terminalFocus) $(".panel-body").scrollTop = 0;
    state.view = view;
    state.terminalFocus = terminalFocus;
    paint();
  }

  function revealStaffing(type) {
    notifyTab("terminal", type);
    openOperationsFromMap("staffing", type);
    $("#terminal-view").scrollIntoView({block: "start", inline: "nearest"});
    const panel = $("#staffing-" + type);
    const action = mobileLayout.matches ? panel.querySelector("button:enabled") : null;
    if (action) action.parentElement.scrollIntoView({block: "nearest"});
    (action ?? panel.querySelector("h3")).focus({preventScroll: true});
  }

  function revealBaggageClaim(fromMap = false) {
    notifyTab("terminal", "claim");
    if (fromMap) openOperationsFromMap("claim");
    else if (mobileLayout.matches) showMobileView("operations");
    $("#baggage-claim").scrollIntoView({block: "start", inline: "nearest"});
    const choice = mobileLayout.matches ? $("#claim-flights button:enabled") : null;
    if (choice) choice.parentElement.scrollIntoView({block: "nearest"});
    (choice ?? $("#baggage-claim-title")).focus({preventScroll: true});
  }

  function flightAtGate(gate) {
    return state.flights.find(flight => {
      if (flight.gate !== gate) return false;
      if (flight.stage !== "outbound") return true;
      const movement = state.movements.get(flight);
      return movementElapsed(movement) < movement.pushbackEnd;
    });
  }

  function isArriving({stage}) {
    return stage === "scheduled" || stage === "holding" || stage === "reserved" || stage === "inbound";
  }

  function isOvernightArrival({takeoffAt}) {
    return takeoffAt === null;
  }

  function parkedAircraft() {
    return state.flights.filter(flight => flight.gate !== null && !isArriving(flight) && flight.stage !== "outbound")
      .map(({gate, aircraft}) => ({gate, aircraft})).sort((a, b) => a.gate - b.gate);
  }

  function holdingFlights() {
    return state.flights.filter(({stage}) => stage === "holding" || stage === "reserved");
  }

  function flightAtHoldingPoint(waiting = holdingFlights()) {
    if (!waiting.length) return null;
    for (const movement of state.movements.values()) {
      if (movement.flight.stage !== "inbound") continue;
      const {x, z} = positionAlongPath(movement);
      if (Math.hypot(x - holdingPosition.x, z - holdingPosition.z) < taxiSeparation) return null;
    }
    return waiting.find(flight => flight.id === state.selected) || waiting[0];
  }

  function movementElapsed({start, duration}) {
    return Math.min(duration, state.now - start);
  }

  function departureOnRunway(flight) {
    const movement = state.movements.get(flight);
    return movement && movementElapsed(movement) >= movement.runwayEntry;
  }

  function shiftComplete() {
    return state.results.length === state.departureCount &&
      (state.closedAtCurfew || (state.flights.every(flight => !isOvernightArrival(flight) || flight.stage === "overnight") &&
        state.luggage.claims.every(({flight}) => flight.carousel !== null)));
  }

  function availableGate() {
    return gates.findIndex((_, index) => !flightAtGate(index));
  }

  function selectedGate() {
    const flight = state.flights.find(item => item.id === state.selected);
    if (flight?.stage === "outbound" && flightAtGate(flight.gate) !== flight) return -1;
    if (flight?.gate != null) return flight.gate;
    const {gateFromMap} = state;
    if (flight?.stage === "holding" && gateFromMap !== null && !flightAtGate(gateFromMap)) return gateFromMap;
    return state.selected?.startsWith("gate-") ? Number(state.selected.slice(5)) : -1;
  }

  const flightElements = new Map();
  const flightDetail = $("#flight-detail");
  const delayNotice = $("#departure-delay-notice");
  const gatePicker = $("#gate-picker");
  const gatePickerLegend = gatePicker.querySelector("legend");

  const gateOptions = gates.map(({name}, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gate-choice";
    button.innerHTML = "<small></small><strong></strong>";
    button.querySelector("strong").textContent = name;
    button.addEventListener("click", () => assignGate(index));
    $("#gate-options").append(button);
    return {button, name, label: button.querySelector("small")};
  });

  function paintGatePicker(flight, gate) {
    gatePicker.hidden = flight?.stage !== "holding";
    if (gatePicker.hidden) return;
    const title = gate < 0 ? "Assign a gate" : "Gate " + gates[gate].name + " selected on map";
    if (gatePickerLegend.textContent !== title) gatePickerLegend.textContent = title;
    gateOptions.forEach(({button, name, label}, index) => {
      const occupant = flightAtGate(index);
      button.disabled = Boolean(occupant);
      button.toggleAttribute("data-map-selected", gate === index);
      const status = !occupant ? "Assign"
        : occupant.stage === "reserved" || occupant.stage === "inbound" ? "Reserved" : "Occupied";
      label.textContent = status;
      button.setAttribute("aria-label", occupant ? name + " " + status : "Assign " + name);
    });
  }

  function clockMinutes(seconds) {
    return startMinutes + Math.floor(seconds / secondsPerMinute + 1e-9);
  }

  function operatingDay(minutes = clockMinutes(state.now)) {
    return state.day + Math.floor(minutes / 1440);
  }

  function formatDay(day) {
    return "Day " + String(day).padStart(2, "0");
  }

  function formatTime(minutes) {
    return [Math.floor(minutes / 60) % 24, minutes % 60].map(num => String(num).padStart(2, "0")).join(":");
  }

  function paintBoardingTime(container, flight) {
    container.hidden = flight?.stage !== "parked";
    if (container.hidden) return;
    const time = container.querySelector("time");
    time.dateTime = formatTime(clockMinutes(flight.boardingAt));
    time.textContent = time.dateTime;
    const open = boardingOpen(flight);
    container.toggleAttribute("data-open", open);
    container.querySelector(".boarding-label").textContent = open ? "Boarding open" : "Boarding time";
  }

  function boardingOpen(flight) {
    return flight.stage === "parked" && state.now >= flight.boardingAt;
  }

  function takeoffSchedule(flight) {
    if (!flight || isOvernightArrival(flight)) return null;
    const movement = state.movements.get(flight);
    if (movement && movementElapsed(movement) >= movement.liftoff) return null;

    const scheduledMinute = clockMinutes(flight.takeoffAt);
    const remaining = scheduledMinute - clockMinutes(state.now);
    const time = formatTime(scheduledMinute);
    if (remaining < 0) return {time, urgency: "late", lateMinutes: -remaining, message: -remaining + " min late"};
    if (remaining === 0) return {time, urgency: "due", message: "Due now"};
    if (remaining <= takeoffWarningMinutes) return {time, urgency: "due", message: remaining + " min to go"};
    return {time, urgency: "", message: ""};
  }

  function paintTakeoffTime(container, alert, flight, card) {
    const schedule = takeoffSchedule(flight);
    container.hidden = !schedule;
    alert.hidden = !schedule?.message;
    card.dataset.takeoff = schedule?.urgency || "";
    if (!schedule) return;
    const time = container.querySelector("time");
    time.dateTime = schedule.time;
    time.textContent = schedule.time;
    alert.textContent = schedule.message;
  }

  function paintMapDelay(button, label, schedule) {
    const message = schedule?.urgency === "late" ? schedule.message : "";
    button.dataset.takeoff = message ? "late" : "";
    label.hidden = !message;
    if (label.textContent !== message) label.textContent = message;
    return message ? ", " + message : "";
  }

  function flightStatus(flight) {
    if (flight === state.nextDeparture) return "Takeoff queued";
    if (flight.stage === "outbound" && departureOnRunway(flight)) return "Taking off";
    return statusText[flight.stage];
  }

  function scheduleTime(seconds) {
    const time = formatTime(clockMinutes(seconds));
    return '<time datetime="' + time + '">' + time + '</time>';
  }

  function buildScheduleRows() {
    const {timetable} = state;
    const rows = timetable.map(({id, destination, arrivalAt, boardingAt, takeoffAt}) => {
      const row = document.createElement("tr");
      const arrival = arrivalAt === null ? '<span class="schedule-initial">Overnight</span>' : scheduleTime(arrivalAt);
      const name = takeoffAt === null ? "From " + destination : destination;
      const boarding = boardingAt === null ? "—" : scheduleTime(boardingAt);
      const takeoff = takeoffAt === null ? '<span class="schedule-initial">Overnight</span>' : scheduleTime(takeoffAt);
      row.innerHTML = '<th scope="row"><button type="button" class="schedule-flight">' + name +
        '</button><span class="schedule-destination" hidden>' + name + '</span><span class="schedule-id">' +
        id + '<span class="schedule-gate"></span></span></th><td>' + arrival + '</td><td>' + boarding +
        '</td><td>' + takeoff + '<span class="schedule-status"></span></td>';
      const button = row.querySelector("button");
      button.setAttribute("aria-label", "Open " + name + " " + id + " on flight board");
      button.addEventListener("click", () => {
        const flight = state.flights.find(item => item.id === id);
        if (!flight) return;
        if (flight.stage === "scheduled") $("#upcoming").open = true;
        select(id);
        revealFlight();
      });
      return {id, row, button, destinationLabel: row.querySelector(".schedule-destination"),
        gateLabel: row.querySelector(".schedule-gate"), status: row.querySelector(".schedule-status")};
    });
    $("#schedule-rows").replaceChildren(...rows.map(({row}) => row));
    $("#schedule-hours").textContent = "Curfew " + formatTime(curfewMinutes);
    return rows;
  }

  let scheduleRows = buildScheduleRows();

  function paintSchedule() {
    const active = new Map(state.flights.map(flight => [flight.id, flight]));
    const results = new Map(state.results.map(result => [result.id, result]));
    for (const {id, row, button, destinationLabel, gateLabel, status} of scheduleRows) {
      const result = results.get(id);
      const flight = result ? null : active.get(id);
      const cancelled = result?.takeoff === null;
      const gate = flight && gates[flight.gate];
      button.hidden = !flight;
      destinationLabel.hidden = Boolean(flight);
      gateLabel.textContent = gate ? " · " + gate.name : "";
      row.dataset.stage = flight?.stage ?? (cancelled ? "cancelled" : "departed");
      row.dataset.late = result && result.takeoff > result.due ? "true" : "false";
      const unparked = state.closedAtCurfew && flight && isOvernightArrival(flight) && isArriving(flight);
      status.textContent = unparked ? "Unparked at curfew" : cancelled ? "Cancelled at curfew"
        : result ? "Left " + formatTime(result.takeoff) : flightStatus(flight);
      status.hidden = flight?.stage === "scheduled" && !unparked;
    }
  }

  function paintFlightProgress(button, flight) {
    if (isOvernightArrival(flight)) {
      button.querySelector(".flight-progress").hidden = true;
      return;
    }
    const {checkIn, security, gate, gateQueue, boarded, boarding, missed, outside} = occupancy.byFlight.get(flight.id);
    button.querySelector(".flight-progress").hidden = flight.stage === "scheduled" && outside === flight.passengers;
    button.querySelector(".flight-load b").textContent = boarded + " / " + flight.passengers;
    button.querySelector(".flight-progress-track span").style.width = boarded / flight.passengers * 100 + "%";
    const stages = [[checkIn, "at check-in"], [security, "at security"], [gate + gateQueue, "at gate"],
      [boarding, "walking to aircraft"], [outside, "yet to arrive"], [missed, "empty seats"]];
    const lateWaiting = notifiedLatePassengers(flight);
    const late = lateWaiting ? '<span class="flight-late-passengers">' + latePassengerLabel(lateWaiting) + '</span>' : '';
    button.querySelector(".flight-stages").innerHTML = stages.filter(([count]) => count > 0)
      .map(([count, label]) => '<span><b>' + count + '</b> ' + label + '</span>').join("") + late;
  }

  function notifiedLatePassengers(flight) {
    if (flight.stage !== "boarding") return 0;
    const {regularUnboarded, lateOutside, lateInTerminal} = occupancy.byFlight.get(flight.id);
    if (regularUnboarded) return 0;
    const taxiToLiftoff = outboundRoutes[flight.gate]?.liftoff ?? 0;
    const notice = Math.max(lateNoticeMinutes * secondsPerMinute, taxiToLiftoff + 4 * secondsPerMinute);
    if (state.now < flight.takeoffAt - notice) return 0;
    return lateOutside + lateInTerminal;
  }

  function latePassengerLabel(count) {
    return count + (count === 1 ? " late passenger" : " late passengers");
  }

  function paintFlightAlert(id, flight, message, additional) {
    const alert = $(id);
    alert.hidden = !flight;
    if (!flight) {
      delete alert.dataset.flight;
      return false;
    }
    const label = additional ? message + " · +" + additional + (additional === 1 ? " flight" : " flights") : message;
    if (alert.textContent !== label) alert.textContent = label;
    const changed = alert.dataset.flight !== flight.id;
    alert.dataset.flight = flight.id;
    return changed;
  }

  function reminderActive(flight, field) {
    const started = flight[field] ??= state.playTime;
    return state.playTime - started < flightReminderSeconds;
  }

  function paintLateAlert(complete) {
    const flights = complete ? [] : state.flights.filter(notifiedLatePassengers);
    const flight = flights.at(-1);
    const message = flight && flight.id + " · " + latePassengerLabel(notifiedLatePassengers(flight));
    if (paintFlightAlert("#late-flight-alert", flight, message, flights.length - 1)) {
      announce(message + ". Open the flight to review boarding.");
    }
  }

  function paintBoardingAlert(complete) {
    const flights = complete ? [] : state.flights.filter(flight =>
      boardingOpen(flight) && reminderActive(flight, "boardingReminderAt"));
    const flight = flights[0];
    const label = flight && "Boarding open · " + flight.id + " · " + gates[flight.gate].name;
    if (paintFlightAlert("#boarding-open-alert", flight, label, flights.length - 1)) {
      announce(flight.id + " can start boarding at " + gates[flight.gate].name + ".");
    }
  }

  function paintArrivalAlert(complete) {
    const arrivals = complete ? [] : state.flights.filter(flight => flight.stage === "holding")
      .sort((a, b) => a.arrivalAt - b.arrivalAt);
    const gatesFull = arrivals.length > 0 && availableGate() < 0;
    const actionable = gatesFull ? [] : arrivals.filter(flight =>
      flight.waitedForGate && reminderActive(flight, "gateReminderAt"));
    const status = $("#arrival-holding-status");
    status.hidden = !arrivals.length || actionable.length > 0;
    status.toggleAttribute("data-gates-full", gatesFull);
    if (!status.hidden) {
      const count = arrivals.length + (arrivals.length === 1 ? " arrival holding" : " arrivals holding");
      const label = gatesFull ? count + " · Gates full" : count;
      if (status.textContent !== label) status.textContent = label;
    }
    const flight = actionable[0];
    paintFlightAlert("#arrival-alert", flight, flight && flight.id + " · Choose a gate", actionable.length - 1);
  }

  function onTimePushbackAt(flight) {
    return flight.takeoffAt - outboundRoutes[flight.gate].liftoff;
  }

  function pushbackMinutesRemaining(flight) {
    return Math.ceil((onTimePushbackAt(flight) - state.now) / secondsPerMinute - 1e-9);
  }

  function paintDepartureAlert(complete) {
    const warningHorizon = state.now + pushbackWarningMinutes * secondsPerMinute;
    const flights = complete || state.nextDeparture ? [] : state.flights.filter(flight =>
      flight.stage === "ready" && onTimePushbackAt(flight) <= warningHorizon && fitsCurfew(outboundMovement(flight)) &&
      (pushbackMinutesRemaining(flight) >= 0 || reminderActive(flight, "overdueReminderAt")))
      .sort((a, b) => onTimePushbackAt(a) - onTimePushbackAt(b));
    const flight = flights[0];
    let label;
    if (flight) {
      const minutes = pushbackMinutesRemaining(flight);
      const timing = minutes > 0 ? minutes + " min to leave the gate"
        : minutes === 0 ? "Leave the gate now" : "Late leaving the gate";
      label = timing + " · " + flight.id;
    }
    paintFlightAlert("#departure-alert", flight, label, flights.length - 1);
  }

  function paintFlights() {
    const flightList = $("#flight-list");
    const upcomingList = $("#upcoming-list");
    const upcoming = state.flights.filter(flight => flight.stage === "scheduled").sort((a, b) => a.arrivalAt - b.arrivalAt);
    $("#upcoming").hidden = upcoming.length === 0;
    $("#upcoming-count").textContent = upcoming.length;
    $("#upcoming-next").textContent = upcoming.length ? "Next at " + formatTime(clockMinutes(upcoming[0].arrivalAt)) : "";
    const active = new Set(state.flights.map(flight => flight.id));
    for (const [id, {card}] of flightElements) {
      if (!active.has(id)) {
        if (flightDetail.parentNode === card) $("#flight-view").append(flightDetail);
        card.remove();
        flightElements.delete(id);
      }
    }
    for (const flight of [...state.flights.filter(flight => flight.stage !== "scheduled"), ...upcoming]) {
      let entry = flightElements.get(flight.id);
      if (!entry) {
        const card = document.createElement("div");
        card.className = "flight-card";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "flight";
        button.style.setProperty("--livery", airlines[flight.airline].ui);
        button.innerHTML = '<span class="airline-mark">' + planeIcon + '</span>' +
          '<span class="flight-name"><strong></strong><small></small>' +
          '<span class="flight-arrival" hidden>Aircraft due <time></time></span>' +
          '<span class="flight-takeoff" hidden>Takeoff <time></time></span></span>' +
          '<span class="flight-state">' +
          '<span class="flight-status"></span>' +
          '<span class="flight-boarding" hidden><span class="boarding-label"></span><time></time></span>' +
          '<span class="takeoff-alert" hidden></span></span>' +
          '<span class="flight-chevron" aria-hidden="true"></span>' +
          '<span class="flight-progress"><span class="flight-load"><span><b></b> boarded</span>' +
          '<span class="flight-progress-track" aria-hidden="true"><span></span></span></span>' +
          '<span class="flight-stages"></span></span>';
        button.addEventListener("click", () => {
          const expanded = state.selected === flight.id;
          select(expanded ? null : flight.id);
          if (!expanded && mobileLayout.matches) revealFlight(false);
        });
        card.append(button);
        entry = {card, button};
        flightElements.set(flight.id, entry);
      }
      const {card, button} = entry;
      const expected = flight.stage === "scheduled";
      const list = expected ? upcomingList : flightList;
      if (card.parentNode !== list) list.append(card);
      const expanded = flight.id === state.selected;
      card.classList.toggle("expanded", expanded);
      button.setAttribute("aria-expanded", String(expanded));
      if (expanded) button.setAttribute("aria-controls", flightDetail.id);
      else button.removeAttribute("aria-controls");
      const arriving = isArriving(flight);
      const gate = gates[flight.gate];
      button.querySelector("strong").textContent = isOvernightArrival(flight) ? "From " + flight.destination
        : arriving ? "To " + flight.destination : flight.destination;
      button.querySelector("small").textContent = gate ? flight.id + " · " + gate.name : flight.id;
      paintArrivalTime(button.querySelector(".flight-arrival"), flight);
      const badge = button.querySelector(".flight-status");
      const boarding = button.querySelector(".flight-boarding");
      paintBoardingTime(boarding, flight);
      paintTakeoffTime(button.querySelector(".flight-takeoff"), button.querySelector(".takeoff-alert"), flight, button);
      badge.hidden = !boarding.hidden;
      badge.dataset.stage = flight === state.nextDeparture ? "queued" : flight.stage;
      badge.textContent = flightStatus(flight);
      paintFlightProgress(button, flight);
    }
    $("#flight-view").querySelector(".empty-board").hidden = shiftComplete() || upcoming.length !== state.flights.length;
    const occupied = gates.filter((_, index) => flightAtGate(index)).length;
    $("#gate-count").textContent = occupied + " / " + gates.length + " gates in use";
    const moving = [...state.movements.keys()];
    const onRunway = moving.find(departureOnRunway);
    $("#airfield-label").textContent = onRunway || !moving.length ? "Runway 09 / 27" : "Taxiway";
    $("#airfield-status").textContent = onRunway ? onRunway.id + " taking off"
      : moving.length > 1 ? moving.length + " aircraft taxiing"
      : moving.length ? moving[0].id + (moving[0].stage === "inbound" ? " taxiing in" : " taxiing out") : "Available";
    const {nextDeparture} = state;
    $("#next-slot").textContent = nextDeparture?.id ?? "Open";
    $("#next-slot").classList.toggle("reserved-slot", Boolean(nextDeparture));
  }

  function paintArrivalTime(container, flight) {
    container.hidden = flight?.stage !== "scheduled";
    if (!container.hidden) {
      const time = container.querySelector("time");
      time.dateTime = formatTime(clockMinutes(flight.arrivalAt));
      time.textContent = time.dateTime;
    }
  }

  function stat(label, value) {
    return '<div class="detail-stat"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  function departureFine(lateMinutes) {
    const standardMinutes = Math.max(0, Math.min(lateMinutes, severeDelayMinutes) - departureGraceMinutes);
    const severeMinutes = Math.max(0, lateMinutes - severeDelayMinutes);
    return standardMinutes * finePerLateMinute + severeMinutes * finePerSevereLateMinute;
  }

  function paintDetail() {
    const flight = state.flights.find(item => item.id === state.selected);
    const gate = selectedGate();
    const action = $("#flight-action");
    const close = $("#close-boarding");
    const upgrade = $("#flight-upgrade");
    const lateNotice = $("#late-passengers");
    const host = flightElements.get(flight?.id)?.card ?? $("#flight-view");
    if (flightDetail.parentNode !== host) host.append(flightDetail);
    paintGatePicker(flight, gate);
    close.hidden = upgrade.hidden = lateNotice.hidden = delayNotice.hidden = true;
    flightDetail.hidden = !flight && gate < 0;
    if (flightDetail.hidden) return;
    $("#stand-heading").hidden = Boolean(flight);
    action.hidden = !flight || ["holding", "boarding", "deplaning", "scheduled", "overnight"].includes(flight.stage);
    if (!flight) {
      $("#stand-name").textContent = "Gate " + gates[gate].name;
      $("#detail-content").innerHTML = '<p class="detail-copy">This gate can receive the next arrival.</p>';
      return;
    }
    const {stage, passengers, id} = flight;
    const counts = occupancy.byFlight.get(id);
    const arriving = isArriving(flight);
    if (stage === "scheduled" || stage === "holding") {
      $("#detail-content").innerHTML = stage === "holding" ? '<p class="detail-copy">Aircraft holding for a gate.</p>' : "";
    } else if (stage === "reserved") {
      $("#detail-content").innerHTML = '<p class="detail-copy">Gate ' + gates[flight.gate].name +
        ' is reserved. Taxi-in starts when the taxiway clears.</p>';
    } else if (stage === "inbound") {
      $("#detail-content").innerHTML = '<p class="detail-copy">Taxiing to gate ' + gates[flight.gate].name + '.</p>';
    } else if (stage === "deplaning") {
      const {remaining, onBridge} = flight.deplaning;
      $("#detail-content").innerHTML = '<div class="flow-stats">' + stat("Arrivals still aboard", remaining) +
        stat("Arrivals on jet bridge", onBridge) + '</div>';
    } else if (stage === "overnight") {
      $("#detail-content").innerHTML = '<p class="detail-copy">Stays at ' + gates[flight.gate].name + ' for tomorrow’s departures.</p>';
    } else if (stage === "outbound") {
      $("#detail-content").innerHTML = departureOnRunway(flight)
        ? '<p class="detail-copy">Taking off from runway 09.</p>'
        : '<p class="detail-copy">Aircraft cleared for runway 09.</p>';
    } else {
      const {outside, boarded, boarding, gateQueue, gate: lounge, missed, checkIn, security} = counts;
      const elsewhere = passengers - outside - missed - boarded - lounge - gateQueue - boarding - checkIn - security;
      $("#detail-content").innerHTML = '<div class="flow-stats">' + (checkIn ? stat("At check-in", checkIn) : "") +
        (security ? stat("At security", security) : "") + stat("In lounge", lounge) +
        stat("In boarding line", gateQueue) + stat("Walking to aircraft", boarding) +
        (elsewhere ? stat("Elsewhere in terminal", elsewhere) : "") +
        (outside ? stat("Yet to arrive", outside) : "") + (missed ? stat("Empty seats", missed) : "") + '</div>';
    }
    if (arriving && !isOvernightArrival(flight)) {
      $("#detail-content").insertAdjacentHTML("beforeend", '<div class="flow-stats">' +
        stat("Passengers in terminal", (passengers - counts.outside) + " / " + passengers) + '</div>');
    }
    if (stage === "deplaning") {
      const carousel = baggageCarousels.find(({id}) => id === flight.carousel);
      $("#detail-content").insertAdjacentHTML("beforeend", '<div class="flow-stats">' +
        stat("Baggage claim", carousel ? "Carousel " + carousel.number : "Awaiting carousel") + '</div>');
    }
    const {lateOutside, lateInTerminal} = counts;
    const lateWaiting = notifiedLatePassengers(flight);
    const schedule = takeoffSchedule(flight);
    delayNotice.hidden = !lateWaiting && !schedule?.urgency;
    if (!delayNotice.hidden) {
      const lateMinutes = schedule?.lateMinutes ?? 0;
      const fine = departureFine(lateMinutes);
      const rate = currency.format(lateMinutes >= severeDelayMinutes ? finePerSevereLateMinute : finePerLateMinute) + "/min";
      delayNotice.textContent = "Late fine · " + (fine ? currency.format(fine) + " so far (+" + rate + ")"
        : rate + " after " + departureGraceMinutes + " min late");
    }
    if (lateWaiting) {
      lateNotice.hidden = false;
      lateNotice.innerHTML = (lateOutside ? stat("Late passengers yet to arrive", lateOutside) : "") +
        (lateInTerminal ? stat("Late passengers in terminal", lateInTerminal) : "");
    }
    const waiting = passengers - counts.boarded - counts.boarding - counts.missed;
    const nextDeparture = state.nextDeparture;
    const beforeBoarding = stage === "parked" && !boardingOpen(flight);
    const departure = stage === "ready" ? outboundMovement(flight) : null;
    const pastLastCall = departure && !fitsCurfew(departure);
    const readyAction = pastLastCall ? "Too late for curfew"
      : flight === nextDeparture ? "Release next takeoff slot"
      : nextDeparture ? "Take " + nextDeparture.id + "’s runway slot"
      : departure && !canStartTaxi(departure) ? "Reserve next takeoff slot"
      : "Clear for departure";
    const labels = {
      parked: beforeBoarding ? "Boarding opens at " + formatTime(clockMinutes(flight.boardingAt)) : "Start boarding",
      closing: "Finishing boarding",
      ready: readyAction,
      reserved: "Waiting for taxi clearance",
      inbound: "Taxiing to gate", outbound: "Departure in progress"
    };
    action.textContent = labels[stage] ?? "";
    action.disabled = beforeBoarding || pastLastCall || (stage !== "parked" && stage !== "ready");
    close.hidden = stage !== "boarding" || waiting === 0;
    if (!close.hidden) close.textContent = "Close boarding · " + waiting + (waiting === 1 ? " empty seat" : " empty seats");
    upgrade.hidden = counts.security === 0 || flow.security.every(bank => bank.status === "open");
    if (!upgrade.hidden) paintOpenStaffing(upgrade, "security", counterNames.security.toLowerCase());
  }

  function formatHourlyRate(perMinute) {
    return currency.format(perMinute * 60) + "/hr";
  }

  function paintOpenStaffing(button, type, unit) {
    const action = flow[type].some(bank => bank.status === "closing") ? "Reopen" : "Open";
    if (button.dataset.action === action) return;
    button.dataset.action = action;
    button.innerHTML = action + " " + unit + (action === "Open"
      ? ' <span class="staffing-action-rate">+' + formatHourlyRate(staffingRates[type]) + "</span>" : "");
  }

  function paintStaffing(type) {
    const panel = $("#staffing-" + type);
    panel.hidden = state.terminalFocus !== null && state.terminalFocus !== type;
    const banks = flow[type];
    const indicators = panel.querySelector(".staffing-lanes").children;
    banks.forEach((bank, index) => {
      const indicator = indicators[index];
      if (indicator.dataset.status === bank.status) return;
      indicator.dataset.status = bank.status;
      indicator.querySelector("strong").textContent = counterStatus[bank.status];
    });
    const open = banks.filter(bank => bank.status === "open").length;
    const closing = banks.filter(bank => bank.status === "closing").length;
    panel.querySelector(".staffing-count").textContent = open + " / " + banks.length + " open" +
      (closing ? " · " + closing + " closing" : "");
    const openButton = panel.querySelector('[data-staffing="open"]');
    paintOpenStaffing(openButton, type, counterNames[type].toLowerCase());
    openButton.disabled = shiftComplete() || open === banks.length;
    panel.querySelector('[data-staffing="close"]').disabled = shiftComplete() || open === 1;
  }

  function activeStaffingRate(type) {
    const extraStaffed = flow[type].filter(bank => bank.status !== "closed").length - 1;
    return extraStaffed * staffingRates[type];
  }

  function staffingCost(type) {
    return Math.round(state.staffingCosts[type]);
  }

  function treasuryBalance() {
    return state.cash - staffingCost("checkIn") - staffingCost("security");
  }

  function paintBaggageClaim({carousels, waiting, available}, complete) {
    $("#carousel-status").innerHTML = carousels.map(({number, flight}) =>
      stat("Carousel " + number, flight?.id ?? "Available")).join("");
    $("#claim-queue").hidden = waiting.length === 0;
    $("#claim-instruction").textContent = complete ? "Shift ended with baggage waiting for a carousel."
      : available ? "Assign a carousel for each flight."
      : carousels.length === 1 ? "The carousel is in use." : "All carousels are in use.";
    const options = waiting.map(({flight, bags, ready}) => {
      const choices = carousels.map(({id, number, flight: occupant}) => {
        const name = "Carousel " + number;
        return '<button type="button" class="secondary" data-claim-flight="' + flight.id + '" data-carousel="' + id +
          '" aria-label="Assign ' + flight.id + ' to ' + name + '"' + (occupant || complete ? ' disabled=""' : "") +
          '>' + (occupant || complete ? name : "Assign " + name) + '</button>';
      }).join("");
      return '<div class="claim-flight"><strong>' + flight.id + ' · ' + flight.destination + '</strong><small>' +
        (ready ? "Ready for belt" : "Sorting bags") + ' · ' + bags.length + ' bags</small><div class="claim-actions">' +
        choices + '</div></div>';
    }).join("");
    const flights = $("#claim-flights");
    if (flights.innerHTML !== options) {
      const focused = flights.contains(document.activeElement) ? document.activeElement.dataset : null;
      flights.innerHTML = options;
      if (focused) {
        const button = flights.querySelector('[data-claim-flight="' + focused.claimFlight + '"][data-carousel="' +
          focused.carousel + '"]:enabled');
        (button ?? $("#baggage-claim-title")).focus({preventScroll: true});
      }
    }
  }

  function paint() {
    if (occupancyDirty) {
      occupancy = passengerFlow.snapshot(state.flights, flow);
      occupancyDirty = false;
      requestDraw = true;
    }
    const minutes = clockMinutes(state.now);
    const time = formatTime(minutes);
    const dispatched = state.results.filter(({takeoff}) => takeoff !== null).length;
    const baseSatisfaction = Math.min(100, 84 + dispatched * 2 -
      Math.floor((occupancy.security.length - 38) / 16) - Math.ceil(state.missedPassengers / 5) - Math.floor(state.delayMinutes / 5));
    const baggageLoss = Math.min(maxBaggageSatisfactionLoss,
      Math.ceil(state.luggage.claimStats.delayedPassengers / baggageDelaysPerSatisfactionPoint));
    const satisfaction = Math.max(55, baseSatisfaction - baggageLoss);
    const staffingSpent = staffingCost("checkIn") + staffingCost("security");
    $("#cash").textContent = currency.format(treasuryBalance());
    $("#passengers").textContent = occupancy.total;
    $("#satisfaction").textContent = satisfaction + "%";
    $(".clock-day").textContent = formatDay(operatingDay(minutes)).toUpperCase();
    $("#clock").textContent = time;
    $("#clock").setAttribute("datetime", time);
    const complete = shiftComplete();
    const remaining = curfewMinutes - minutes;
    const warnCurfew = !complete && remaining <= curfewWarningMinutes;
    const clock = $(".clock");
    if (warnCurfew) clock.dataset.curfew = remaining <= curfewUrgentMinutes ? "urgent" : "soon";
    else delete clock.dataset.curfew;
    const countdown = $("#curfew-countdown");
    countdown.hidden = !warnCurfew;
    if (warnCurfew) countdown.textContent = "Curfew in " + remaining + " min";
    $("#run-label").textContent = state.closedAtCurfew ? "Curfew" : complete ? "Complete" : state.paused ? "Paused" : "Running";
    $("#run-label").classList.toggle("paused", state.closedAtCurfew || (state.paused && !complete));
    $("#pause-icon").setAttribute("href", state.paused ? "#play" : "#pause");
    $("#pause-toggle").setAttribute("aria-label", state.paused ? "Resume simulation" : "Pause simulation");
    $("#pause-toggle").disabled = complete;
    const fastForward = $("#fast-forward-toggle");
    fastForward.disabled = complete;
    fastForward.setAttribute("aria-pressed", String(!complete && state.speed === fastForwardSpeed));
    const terminalOpen = state.view === "terminal";
    const scheduleOpen = state.view === "schedule";
    const flightsOpen = state.view === "flights";
    const claimOpen = terminalOpen && state.terminalFocus === "claim";
    const claimBoard = baggage.claimBoard(state.luggage);
    const chooseClaim = !complete && claimBoard.available > 0 && claimBoard.waiting.length > 0;
    $("#claim-alert").hidden = !chooseClaim || claimOpen;
    $(".objective").hidden = !flightsOpen && !complete;
    $("#terminal-tab").setAttribute("aria-pressed", String(terminalOpen));
    $("#schedule-tab").setAttribute("aria-pressed", String(scheduleOpen));
    $("#flights-tab").setAttribute("aria-pressed", String(flightsOpen));
    $("#terminal-view").hidden = !terminalOpen;
    $("#schedule-view").hidden = !scheduleOpen;
    $("#flight-view").hidden = !flightsOpen || complete;
    paintFlights();
    paintDetail();
    paintArrivalAlert(complete);
    paintBoardingAlert(complete);
    paintDepartureAlert(complete);
    paintLateAlert(complete);
    if (scheduleOpen) paintSchedule();
    if (terminalOpen) {
      $("#terminal-title").textContent = claimOpen ? "Terminal" : "Staffing";
      $("#terminal-overview").hidden = claimOpen;
      $("#all-staffing").hidden = state.terminalFocus === null;
      $("#show-baggage").hidden = claimOpen;
      $("#show-baggage").toggleAttribute("data-action-needed", chooseClaim);
      $("#staffing-hourly").textContent = formatHourlyRate(complete ? 0 : activeStaffingRate("checkIn") + activeStaffingRate("security"));
      $("#staffing-spent").textContent = currency.format(staffingSpent);
      $("#check-in-count").textContent = occupancy.checkIn.length - occupancy.processing.checkIn;
      $("#check-in-processing").textContent = occupancy.processing.checkIn;
      $("#landside-count").textContent = occupancy.landside.length;
      $("#security-count").textContent = occupancy.security.length - occupancy.processing.security;
      $("#security-processing").textContent = occupancy.processing.security;
      $("#concourse-count").textContent = occupancy.concourse.length;
      $("#shared-seats-count").textContent = occupancy.sharedSeats.length;
      $("#cafe-count").textContent = occupancy.cafe.length;
      $("#boarding-count").textContent = occupancy.boarding.length;
      $("#deplaning-count").textContent = occupancy.deplaning.length;
      $("#arrivals-exit-count").textContent = occupancy.arrivalsExit.length;
      $("#exiting-count").textContent = occupancy.exiting.length;
      paintStaffing("checkIn");
      paintStaffing("security");
      paintBaggageClaim(claimBoard, complete);
      $("#lounge-counts").querySelectorAll("b").forEach((count, index) => {
        count.textContent = occupancy.gates[index].length;
      });
    }
    const overnightCount = state.timetable.length - state.departureCount;
    const parked = state.flights.filter(flight => flight.stage === "overnight").length;
    const departuresComplete = !complete && dispatched === state.departureCount;
    const parking = departuresComplete && parked < overnightCount;
    const assigning = departuresComplete && !parking;
    const goal = parking ? overnightCount : state.departureCount;
    const progress = parking ? parked : dispatched;
    const goalBar = $("#goal-bar");
    goalBar.parentNode.hidden = assigning;
    goalBar.style.width = progress / goal * 100 + "%";
    $("#goal-count").textContent = assigning ? claimBoard.waiting.length + " waiting" : progress + " / " + goal;
    $("#objective-title").textContent = state.closedAtCurfew ? "Curfew reached"
      : complete ? "Operating day complete" : parking ? "Park overnight arrivals"
        : assigning ? "Assign baggage carousels" : "Dispatch " + goal + " flights";
    $("#view-report").hidden = !complete;

    const gate = selectedGate();
    mapPins.forEach(({element, count, late}, index) => {
      const flight = flightAtGate(index);
      const waiting = occupancy.gates[index].length;
      const schedule = complete || flight?.stage === "inbound" ? null : takeoffSchedule(flight);
      const delay = paintMapDelay(element, late, schedule);
      count.textContent = waiting;
      element.disabled = complete;
      element.dataset.state = flight?.stage || "free";
      element.setAttribute("aria-pressed", String(gate === index));
      element.setAttribute("aria-label", "Gate " + gates[index].name + ", " +
        (flight ? flightStatus(flight) : "available") + ", " + waiting + " waiting" + delay);
    });
    const waiting = holdingFlights();
    const holding = complete ? null : flightAtHoldingPoint(waiting);
    if (holding) {
      const route = holding.id + (isOvernightArrival(holding) ? " from " : " to ") + holding.destination;
      const schedule = takeoffSchedule(holding);
      const delay = paintMapDelay(holdingPin, holdingPinLate, schedule);
      holdingPinRoute.textContent = route;
      holdingPinSchedule.hidden = !schedule || Boolean(delay);
      holdingPinTime.dateTime = schedule?.time ?? "";
      holdingPinTime.textContent = schedule?.time ?? "";
      holdingPin.setAttribute("aria-pressed", String(holding.id === state.selected));
      holdingPinCount.hidden = waiting.length === 1;
      holdingPinCount.textContent = waiting.length;
      holdingPin.setAttribute("aria-label", waiting.length + " awaiting taxi-in. " + route +
        (schedule ? ". Takeoff at " + schedule.time + delay : ". Parks overnight."));
    }
    for (const {element, count, section} of mapSigns) {
      if (section === "baggageClaim") {
        element.toggleAttribute("data-action-needed", chooseClaim);
        element.setAttribute("aria-label", chooseClaim ? "Baggage claim, carousel assignment needed" : "Baggage claim");
        count.hidden = !chooseClaim && !claimBoard.waiting.length;
        count.textContent = chooseClaim ? "Assign" : claimBoard.waiting.length;
      } else if (count) {
        count.textContent = occupancy[section].length;
      }
    }
  }

  function timedTaxiPath(route) {
    let elapsed = 0;
    return route.map(([x, z, angle, speed = taxiSpeed], index) => {
      if (index > 0) {
        const [previousX, previousZ] = route[index - 1];
        elapsed += Math.hypot(x - previousX, z - previousZ) / speed;
      }
      return [elapsed, x, z, angle];
    });
  }

  const outboundRoutes = gates.map(({x, z}) => {
    const halfTurn = Math.PI / 2;
    const path = timedTaxiPath([
      [x, z, 0], [x, -15, 0, pushbackSpeed], [x - 2.1, -22, -halfTurn, pushbackSpeed],
      [-39.7, taxiwayZ, -halfTurn], [-45, taxiwayZ - 2.3, -2.3],
      [-45, runwayZ + 3.8, Math.PI], [-40.4, runwayZ, halfTurn]
    ]);
    const pushbackEnd = path[2][0];
    const runwayEntry = path.at(-1)[0];
    const liftoff = runwayEntry + 6.72;
    const duration = liftoff + 2.4;
    path.push(
      [runwayEntry + 2.76, -17.4, runwayZ, halfTurn], [runwayEntry + 4.8, 12, runwayZ, halfTurn],
      [liftoff, 42, runwayZ, halfTurn], [duration, 86, runwayZ, halfTurn, 16, .23]
    );
    return {duration, path, pushbackEnd, runwayEntry, liftoff};
  });

  const inboundRoutes = gates.map(({x, z}) => {
    const path = timedTaxiPath([
      [holdingPosition.x, holdingPosition.z, holdingPosition.angle],
      [x + 6, taxiwayZ, holdingPosition.angle], [x + 1.8, -21.2, -.77],
      [x, -17, 0], [x, z, 0]
    ]);
    return {duration: path.at(-1)[0], path};
  });

  function outboundMovement(flight) {
    return {flight, start: state.now, ...outboundRoutes[flight.gate]};
  }

  function fitsCurfew({start, liftoff}) {
    return start + liftoff <= curfewAt;
  }

  function positionAlongPath(movement, elapsed = movementElapsed(movement)) {
    const {path} = movement;
    const end = path.findIndex((point, i) => i > 0 && point[0] >= elapsed);
    const a = path[end - 1], b = path[end];
    const t = (elapsed - a[0]) / (b[0] - a[0]);
    const mix = index => (a[index] || 0) + ((b[index] || 0) - (a[index] || 0)) * t;
    const arc = Math.atan2(Math.sin(b[3] - a[3]), Math.cos(b[3] - a[3]));
    return {x: mix(1), z: mix(2), angle: a[3] + arc * t, y: mix(4), pitch: mix(5)};
  }

  function pathsConflict(candidate, active) {
    const start = candidate.start - active.start;
    const candidateDeparts = candidate.runwayEntry !== undefined;
    const activeDeparts = active.runwayEntry !== undefined;
    const mixedTraffic = candidateDeparts !== activeDeparts;
    // Arrivals stay on the taxiway. A departure only shares pavement with them before it enters the runway.
    const candidateEnd = mixedTraffic && candidateDeparts ? candidate.runwayEntry : candidate.duration;
    const activeEnd = mixedTraffic && activeDeparts ? active.runwayEntry : active.duration;
    const duration = Math.min(candidateEnd, activeEnd - start);
    if (duration <= 0) return false;

    const times = [duration];
    for (const [elapsed] of candidate.path) {
      if (elapsed > 0 && elapsed < duration) times.push(elapsed);
    }
    for (const [elapsed] of active.path) {
      const relative = elapsed - start;
      if (relative > 0 && relative < duration) times.push(relative);
    }
    times.sort((a, b) => a - b);

    // Between waypoints both aircraft move in straight lines, so check their closest approach in each interval.
    const first = positionAlongPath(candidate, 0);
    let other = positionAlongPath(active, start);
    let x = first.x - other.x;
    let z = first.z - other.z;
    for (const time of times) {
      const point = positionAlongPath(candidate, time);
      other = positionAlongPath(active, Math.min(active.duration, start + time));
      const nextX = point.x - other.x;
      const nextZ = point.z - other.z;
      const dx = nextX - x;
      const dz = nextZ - z;
      const distanceSquared = dx * dx + dz * dz;
      const closest = distanceSquared ? Math.max(0, Math.min(1, -(x * dx + z * dz) / distanceSquared)) : 0;
      if (Math.hypot(x + dx * closest, z + dz * closest) < taxiSeparation) return true;
      x = nextX;
      z = nextZ;
    }
    return false;
  }

  function canStartTaxi(candidate) {
    for (const active of state.movements.values()) {
      if (candidate.runwayEntry !== undefined && active.runwayEntry !== undefined &&
        candidate.start + candidate.runwayEntry < active.start + active.duration) return false;
      if (pathsConflict(candidate, active)) return false;
    }
    return true;
  }

  function aircraftPosition(flight) {
    if (flight.stage === "holding" || flight.stage === "reserved") return holdingPosition;
    const movement = state.movements.get(flight);
    if (movement) return positionAlongPath(movement);
    const {x, z} = gates[flight.gate];
    return {x, z};
  }

  function startTaxi(movement) {
    const {flight, runwayEntry} = movement;
    state.movements.set(flight, movement);
    if (runwayEntry !== undefined) {
      state.nextDeparture = null;
      flight.stage = "outbound";
      announce(flight.id + " cleared for departure.");
    } else {
      flight.stage = "inbound";
      announce(flight.id + " taxiing to " + gates[flight.gate].name + ".");
    }
  }

  function releaseTaxiIn() {
    for (const [index, flight] of state.taxiQueue.entries()) {
      const movement = {flight, start: state.now, ...inboundRoutes[flight.gate]};
      if (!canStartTaxi(movement)) continue;
      state.taxiQueue.splice(index, 1);
      startTaxi(movement);
      return;
    }
  }

  function command() {
    if (shiftComplete()) return;
    const flight = state.flights.find(item => item.id === state.selected);
    if (!flight || $("#flight-action").disabled) return;
    if (flight.stage === "parked") {
      if (!boardingOpen(flight)) return;
      flight.stage = "boarding";
      announce("Boarding started at " + gates[flight.gate].name + ".");
    } else if (flight.stage === "ready") {
      if (state.nextDeparture === flight) {
        state.nextDeparture = null;
        announce(flight.id + " released the next takeoff slot.");
      } else {
        const movement = outboundMovement(flight);
        if (!fitsCurfew(movement)) {
          paint();
          return;
        }
        if (canStartTaxi(movement)) {
          startTaxi(movement);
        } else {
          state.nextDeparture = flight;
          announce(flight.id + " has the next takeoff slot.");
        }
      }
    } else {
      return;
    }
    returnToMapAfter("flight", flight.id);
    paint();
  }

  function assignGate(gate) {
    if (shiftComplete() || flightAtGate(gate)) return;
    const flight = state.flights.find(item => item.id === state.selected && item.stage === "holding");
    if (!flight) return;
    state.gateFromMap = null;
    flight.gate = gate;
    flight.stage = "reserved";
    state.taxiQueue.push(flight);
    releaseTaxiIn();
    if (flight.stage === "reserved") {
      announce(gates[gate].name + " reserved for " + flight.id + ".");
    }
    returnToMapAfter("flight", flight.id);
    paint();
    if (!mobileLayout.matches || game.dataset.mobileView === "operations") revealFlight();
  }

  function closeSelectedBoarding() {
    if (shiftComplete()) return;
    const flight = state.flights.find(item => item.id === state.selected);
    if (flight?.stage !== "boarding" || $("#close-boarding").hidden) return;
    const missed = passengerFlow.closeBoarding(flight, flow);
    state.missedPassengers += missed;
    flight.stage = flight.manifest.some(person => person.zone === "boarding") ? "closing" : "ready";
    occupancyDirty = true;
    announce(flight.id + " boarding closed. " + missed + " missed the flight.");
    returnToMapAfter("flight", flight.id);
    paint();
  }

  function finishDeparture({flight, start, liftoff}) {
    const boarded = flight.manifest.filter(person => person.zone === "boarded").length;
    const revenue = 3800 + boarded * passengerFare;
    const liftoffMinute = clockMinutes(start + liftoff);
    const due = clockMinutes(flight.takeoffAt);
    const lateMinutes = Math.max(0, liftoffMinute - due);
    const fine = departureFine(lateMinutes);
    const net = revenue - handlingCost - fine;
    state.delayMinutes += lateMinutes;
    state.cash += net;
    state.results.push({id: flight.id, destination: flight.destination, due, takeoff: liftoffMinute,
      missed: flight.passengers - boarded, revenue, fine});
    state.movements.delete(flight);
    state.flights = state.flights.filter(item => item !== flight);
    if (state.selected === flight.id) state.selected = state.flights[0]?.id || "gate-" + flight.gate;
    const fineMessage = fine ? " (" + currency.format(fine) + " late fine)" : "";
    announce(flight.id + " airborne with " + boarded + " passengers. " + currency.format(net) + " net" + fineMessage + ".");
  }

  function finishShift() {
    nextOpening = {day: state.day + 1, cash: treasuryBalance(), seed: newShiftSeed(), overnightAircraft: parkedAircraft()};
    openingSaved = saveOpening(nextOpening);
    mapAction = null;
    state.paused = true;
    occupancyDirty = true;
    announce(state.closedAtCurfew ? "Curfew reached. Your shift report is ready."
      : "Operating day complete. Your shift report is ready.");
    paint();
    showShiftReport();
  }

  function closeAtCurfew() {
    for (const movement of state.movements.values()) {
      if (movement.flight.stage === "outbound" && fitsCurfew(movement)) finishDeparture(movement);
    }
    state.closedAtCurfew = !shiftComplete();
    for (const flight of state.flights) {
      if (isOvernightArrival(flight)) continue;
      const alreadyMissed = flight.manifest.filter(person => person.zone === "missed").length;
      state.missedPassengers += flight.passengers - alreadyMissed;
      state.results.push({id: flight.id, destination: flight.destination, due: clockMinutes(flight.takeoffAt),
        takeoff: null, missed: flight.passengers, revenue: 0, fine: 0});
    }
    // Freeze grounded aircraft and passengers in place for the end-of-day view.
    state.selected = null;
    state.nextDeparture = null;
    finishShift();
  }

  function advanceShift(simDelta) {
    simDelta = Math.min(simDelta, curfewAt - state.now);
    state.now += simDelta;
    for (const type of Object.keys(staffingRates)) {
      state.staffingCosts[type] += activeStaffingRate(type) * simDelta / secondsPerMinute;
    }
    const changed = passengerFlow.advance(state.flights, flow, state.now, simDelta,
      flight => {
        flight.stage = "ready";
        announce(flight.id + " is ready for departure.");
      },
      flight => {
        const overnight = isOvernightArrival(flight);
        flight.stage = overnight ? "overnight" : "parked";
        announce(flight.id + (overnight ? " parked overnight at " : " finished deplaning at ") + gates[flight.gate].name + ".");
      }, person => {
        const flight = state.flights.find(item => item.id === person.flightId);
        baggage.checkedIn(state.luggage, flight, person, state.now);
      });
    occupancyDirty ||= changed;
    baggage.advance(state.luggage, state.now, simDelta);
    for (const [flight, movement] of state.movements) {
      if (movementElapsed(movement) < movement.duration) continue;
      occupancyDirty = true;
      if (flight.stage === "inbound") {
        state.movements.delete(flight);
        flight.stage = "deplaning";
        passengerFlow.startDeplaning(flight, state.now, baggage.arrived(state.luggage, flight));
        announce(flight.id + " deplaning at " + gates[flight.gate].name + ".");
      } else {
        finishDeparture(movement);
      }
    }
    if (shiftComplete()) {
      finishShift();
      return;
    }
    if (state.now >= curfewAt) {
      closeAtCurfew();
      return;
    }
    if (state.nextDeparture) {
      const movement = outboundMovement(state.nextDeparture);
      if (!fitsCurfew(movement)) state.nextDeparture = null;
      else if (canStartTaxi(movement)) startTaxi(movement);
    }
    releaseTaxiIn();
    const gatesFull = availableGate() < 0;
    for (const flight of state.flights) {
      if (flight.stage === "scheduled" && state.now >= flight.arrivalAt) {
        flight.stage = "holding";
        occupancyDirty = true;
        announce(flight.id + " awaiting a gate assignment.");
      }
      if (gatesFull && flight.stage === "holding") {
        flight.waitedForGate = true;
        delete flight.gateReminderAt;
      }
    }
  }

  function update(dt) {
    if (state.paused) return;
    state.playTime += dt;
    let remaining = dt * state.speed;
    // Keep queue processing and walking on small steps at accelerated speeds.
    while (remaining > 0 && !shiftComplete()) {
      const step = Math.min(remaining, .05);
      advanceShift(step);
      remaining -= step;
    }
  }

  const report = $("#shift-report");
  const startNextDay = $("#restart-shift");

  function showShiftReport() {
    if (!nextOpening) return;
    const results = state.results.slice().sort((a, b) => a.due - b.due);
    const departed = results.filter(({takeoff}) => takeoff !== null);
    const cancelled = results.length - departed.length;
    const onTime = departed.filter(({due, takeoff}) => takeoff <= due).length;
    const revenue = results.reduce((total, flight) => total + flight.revenue, 0);
    const fines = results.reduce((total, flight) => total + flight.fine, 0);
    const handling = departed.length * handlingCost;
    const checkIn = staffingCost("checkIn");
    const security = staffingCost("security");
    const closure = $("#report-closure");
    closure.hidden = !state.closedAtCurfew;
    closure.textContent = formatTime(curfewMinutes) + " curfew" + (cancelled ? " · " + cancelled +
      (cancelled === 1 ? " departure cancelled" : " departures cancelled") : "");
    $("#report-on-time").textContent = onTime + " / " + results.length;
    $("#report-missed").textContent = results.reduce((total, flight) => total + flight.missed, 0);
    const closingCash = treasuryBalance();
    const profit = closingCash - state.openingCash;
    const profitValue = $("#report-profit");
    profitValue.textContent = currency.format(profit);
    profitValue.toggleAttribute("data-loss", profit < 0);
    $("#report-delays").innerHTML = stat("Total departure delay", state.delayMinutes + " min");
    const overnightArrivals = state.flights.filter(isOvernightArrival);
    const arrivalSummary = $("#report-overnight-arrivals");
    arrivalSummary.hidden = overnightArrivals.length === 0;
    arrivalSummary.innerHTML = stat("Overnight arrivals parked",
      overnightArrivals.filter(flight => !isArriving(flight)).length + " / " + overnightArrivals.length);
    const overnightGates = parkedAircraft().map(({gate}) => gates[gate].name);
    $("#report-overnight").textContent = overnightGates.length
      ? "Overnight parking at " + overnightGates.join(", ") + "."
      : "Gates clear overnight.";
    const {delayedPassengers, fullBeltWaitSeconds, unassignedBeltWaitSeconds} = state.luggage.claimStats;
    const unassigned = baggage.claimBoard(state.luggage).waiting.length;
    $("#report-baggage-waits").innerHTML = stat("Passengers who waited over " + baggageWaitGraceMinutes + " min for bags", delayedPassengers) +
      stat("Waiting for a free carousel", Math.round(fullBeltWaitSeconds / secondsPerMinute) + " passenger-min") +
      stat("Carousel free, awaiting assignment", Math.round(unassignedBeltWaitSeconds / secondsPerMinute) + " passenger-min") +
      (unassigned ? stat("Flights without a carousel", unassigned) : "");
    $("#report-finances").innerHTML = stat("Opening treasury", currency.format(state.openingCash)) +
      stat("Flight revenue", currency.format(revenue)) +
      stat("Ground handling", currency.format(-handling)) + stat("Extra check-in staffing", currency.format(0 - checkIn)) +
      stat("Extra security staffing", currency.format(0 - security)) + stat("Late takeoff fines", currency.format(0 - fines)) +
      stat("Closing treasury", currency.format(closingCash));
    $("#report-flights").innerHTML = results.map(({id, destination, due, takeoff, missed, fine}) => {
      const fineLabel = fine ? " · " + currency.format(fine) + " fine" : "";
      const lateLabel = takeoff > due ? '<span class="report-late">+' + (takeoff - due) + ' min' + fineLabel + '</span>' : "";
      const outcome = takeoff === null ? '<span class="report-cancelled">Cancelled</span>' : formatTime(takeoff) + lateLabel;
      return '<tr><th scope="row">' + id + '<span>' + destination + '</span></th><td>' + formatTime(due) +
        '</td><td>' + outcome + '</td><td>' + missed + '</td></tr>';
    }).join("");
    const nextDay = formatDay(nextOpening.day);
    startNextDay.textContent = "Start " + nextDay;
    $("#report-save-status").textContent = openingSaved ? "Saved in this browser. Reopening starts " + nextDay + "."
      : "Progress could not be saved. Keep this tab open to carry on.";
    if (!report.open) report.showModal();
  }

  const aircraftSelection = $("#aircraft-selection");
  const aircraftDelayPins = new Map();
  const mapOverlays = [$(".map-heading"), $(".map-controls")];
  function showAircraftSelection(aircraft) {
    if (!aircraft) {
      aircraftSelection.hidden = true;
      return;
    }
    const {left, top, right, bottom} = renderer.projectBounds(aircraft);
    aircraftSelection.hidden = right <= 0 || bottom <= 0 ||
      left >= renderer.view.width || top >= renderer.view.height;
    if (aircraftSelection.hidden) return;
    const padding = 6;
    aircraftSelection.style.left = (left - padding) + "px";
    aircraftSelection.style.top = (top - padding) + "px";
    aircraftSelection.style.width = (right - left + padding * 2) + "px";
    aircraftSelection.style.height = (bottom - top + padding * 2) + "px";
  }

  function drawAircraftDelays(aircraft) {
    const active = new Set();
    const labels = [];
    for (const object of aircraft) {
      const {flight} = object;
      const movement = state.movements.get(flight);
      if (!movement || (flight.stage === "outbound" && movementElapsed(movement) < movement.pushbackEnd)) continue;
      const schedule = takeoffSchedule(flight);
      if (schedule?.urgency !== "late") continue;

      active.add(flight.id);
      let pin = aircraftDelayPins.get(flight.id);
      if (!pin) {
        pin = document.createElement("button");
        pin.type = "button";
        pin.className = "map-gate map-aircraft-delay";
        pin.dataset.takeoff = "late";
        pin.innerHTML = '<span class="map-chip"></span>';
        pin.addEventListener("click", () => selectFromMap(flight.id));
        $("#map-labels").append(pin);
        aircraftDelayPins.set(flight.id, pin);
      }
      const text = flight.id + " · " + schedule.message;
      if (pin.textContent !== text) pin.firstElementChild.textContent = text;
      pin.setAttribute("aria-pressed", String(flight.id === state.selected));
      const {left, right, top} = renderer.projectBounds(object);
      const x = (left + right) / 2;
      pin.hidden = x < 18 || x > renderer.view.width - 18 || top < 30 || top > renderer.view.height;
      labels.push({element: pin, left: Math.max(70, Math.min(renderer.view.width - 70, x)), top: top - 6});
    }
    for (const [id, pin] of aircraftDelayPins) {
      if (active.has(id)) continue;
      pin.remove();
      aircraftDelayPins.delete(id);
    }
    return labels;
  }

  function placeMapLabels(labels) {
    const gap = 6;
    const {width, height} = renderer.view;
    const occupied = mapOverlays.map(element => ({
      left: element.offsetLeft, top: element.offsetTop,
      right: element.offsetLeft + element.offsetWidth, bottom: element.offsetTop + element.offsetHeight
    }));
    const visible = labels.filter(({element}) => !element.hidden)
      .sort((a, b) => Number(Boolean(a.decorative)) - Number(Boolean(b.decorative)))
      .map(({element, left, top, decorative}) => {
        const w = element.offsetWidth, h = element.offsetHeight;
        return {element, x: left - w / 2, y: top - (element.classList.contains("map-gate") ? h : h / 2), w, h, decorative};
      });
    for (const {element, x, y, w, h, decorative} of visible) {
      // Try the anchor and the edges of occupied space, closest to the anchor first.
      const xs = decorative ? [x] : [x, ...occupied.flatMap(box => [box.left - w - gap, box.right + gap])];
      const ys = decorative ? [y] : [y, ...occupied.flatMap(box => [box.top - h - gap, box.bottom + gap])];
      let best = null;
      let distance = Infinity;
      for (const candidateX of xs) {
        const left = Math.max(gap, Math.min(width - w - gap, candidateX));
        for (const candidateY of ys) {
          const top = Math.max(gap, Math.min(height - h - gap, candidateY));
          const d = (left - x) ** 2 + (top - y) ** 2;
          if (d >= distance || left + w > width - gap || top + h > height - gap) continue;
          if (occupied.some(box => left < box.right + gap && left + w > box.left - gap &&
              top < box.bottom + gap && top + h > box.top - gap)) continue;
          best = {left, top, right: left + w, bottom: top + h};
          distance = d;
        }
        if (distance === 0) break;
      }
      if (!best) {
        element.hidden = true;
        continue;
      }
      occupied.push(best);
      element.style.left = best.left + "px";
      element.style.top = best.top + "px";
    }
  }

  function positionMapLabels(holding, movingLabels) {
    const mobile = mobileLayout.matches;
    const {width, height} = renderer.view;
    const labels = [holdingPinPosition, ...mapPins, ...mapSigns].map(({x, y, z, element, decorative}) => {
      const [left, top] = renderer.project(x, y, z);
      element.hidden = left < 18 || top < 19 || left > width - 18 || top > height - 18 ||
        (decorative && (mobile || width < 520)) ||
        (element === holdingPin && (shiftComplete() || !holding || (!mobile && (left < 90 || left > width - 90))));
      return {element, decorative, left, top};
    }).concat(movingLabels);
    placeMapLabels(labels);
  }

  function draw() {
    if (!renderer || (mobileLayout.matches && game.dataset.mobileView === "operations")) return;
    const holding = flightAtHoldingPoint();
    const aircraft = state.flights.filter(flight => !isArriving(flight) || flight.stage === "inbound" || flight === holding)
      .map(flight => ({mesh: planes[flight.aircraft.airline], ...aircraftPosition(flight), flightId: flight.id, flight}));
    const moving = aircraft.slice();
    const selectedAircraft = aircraft.find(object => object.flightId === state.selected);
    const carTravel = state.now * 2.4;
    for (const vehicle of scene.traffic) {
      const direction = Math.sign(vehicle.angle);
      const x = ((vehicle.offset + carTravel) % 110 - 55) * direction;
      moving.push({...vehicle, x});
    }
    const people = airport.passengerActors(scene.outfits, occupancy, scene.claimedLuggage, scene.securityTray, state.now);
    for (const {person, flight} of occupancy.security) {
      if (flight.id !== state.selected) continue;
      const [x, y, z] = person.position;
      moving.push({mesh: scene.securityHighlight, x, y, z, castShadow: false});
    }
    for (const type of Object.keys(counterMarkers)) {
      for (const bank of flow[type]) {
        moving.push({mesh: counterMarkers[type][bank.status], x: bank.x, castShadow: bank.status === "closed"});
      }
    }
    const gate = gates[selectedGate()];
    if (gate) moving.push({mesh: scene.highlight, x: gate.x, castShadow: false});
    const luggage = baggage.actors(state.luggage, scene.luggage, scene.baggageLoader, scene.baggageTrain, state.now);
    renderer.render([...scene.fixed, ...moving, ...people, ...luggage]);
    showAircraftSelection(selectedAircraft);
    positionMapLabels(holding, drawAircraftDelays(shiftComplete() ? [] : aircraft));
  }

  function togglePause() {
    if (shiftComplete()) return;
    state.paused = !state.paused;
    paint();
  }

  $("#flights-tab").addEventListener("click", () => notifyTab("flights"));
  $("#schedule-tab").addEventListener("click", () => notifyTab("schedule"));
  $("#terminal-tab").addEventListener("click", () => notifyTab("terminal"));
  $("#claim-alert").addEventListener("click", () => revealBaggageClaim());
  $("#show-baggage").addEventListener("click", () => revealBaggageClaim());
  $("#claim-flights").addEventListener("click", event => {
    const button = event.target.closest("[data-claim-flight]");
    if (!button || shiftComplete()) return;
    const {claimFlight, carousel} = button.dataset;
    if (!baggage.assignCarousel(state.luggage, claimFlight, carousel)) return;
    if (shiftComplete()) finishShift();
    else {
      const {number} = baggageCarousels.find(({id}) => id === carousel);
      announce(claimFlight + " baggage assigned to Carousel " + number + ".");
      returnToMapAfter("claim");
      paint();
    }
  });
  $("#all-staffing").addEventListener("click", () => {
    notifyTab("terminal");
    $("#terminal-title").focus();
  });
  for (const alert of $("#flight-alerts").querySelectorAll('[title="Open flight"]')) {
    alert.addEventListener("click", () => {
      const id = alert.dataset.flight;
      if (!id) return;
      select(id);
      if (mobileLayout.matches) showMobileView("operations");
      revealFlight();
    });
  }
  $("#show-map").addEventListener("click", () => showMobileView("map"));
  $("#show-operations").addEventListener("click", () => showMobileView("operations"));
  mobileLayout.addEventListener("change", () => { mapAction = null; });
  $("#flight-action").addEventListener("click", command);
  $("#close-boarding").addEventListener("click", closeSelectedBoarding);
  $("#pause-toggle").addEventListener("click", togglePause);
  $("#view-report").addEventListener("click", showShiftReport);
  $("#close-report").addEventListener("click", () => report.close());
  startNextDay.addEventListener("click", () => {
    if (!nextOpening) return;
    const {day, cash, seed, overnightAircraft} = nextOpening;
    if (!openingSaved) openingSaved = saveOpening(nextOpening);
    nextOpening = null;
    state = createShift(day, overnightAircraft, cash, seed);
    scheduleRows = buildScheduleRows();
    flow = passengerFlow.create();
    occupancyDirty = true;
    $("#upcoming").open = false;
    report.close();
    $(".panel-body").scrollTop = 0;
    showMobileView("map");
    fit();
    announce(!openingSaved ? "Progress could not be saved. Keep this tab open to carry on."
      : overnightAircraft.length ? "Terminal open. Overnight aircraft are at their gates."
        : "Terminal open. Awaiting the first aircraft.");
    paint();
    (mobileLayout.matches ? $("#show-operations") : $("#flights-tab")).focus({preventScroll: true});
  });
  report.addEventListener("close", () => {
    if (!shiftComplete()) return;
    if (mobileLayout.matches) showMobileView("operations");
    $("#view-report").focus();
  });
  function changeStaffing(type, action, fromFlight = false) {
    if (shiftComplete()) return;
    const bank = action === "open" ? passengerFlow.openCounter(flow, type) : passengerFlow.closeCounter(flow, type);
    if (!bank) return;
    const label = counterNames[type] + " " + (flow[type].indexOf(bank) + 1);
    announce(label + (bank.status === "closing" ? " will close after its queue clears." : " is now " + bank.status + "."));
    occupancyDirty = true;
    if (fromFlight) returnToMapAfter("flight", state.selected);
    else returnToMapAfter("staffing", type);
    paint();
  }
  for (const type of Object.keys(staffingRates)) {
    const panel = $("#staffing-" + type);
    const indicators = panel.querySelector(".staffing-lanes");
    flow[type].forEach((_, index) => {
      const indicator = document.createElement("li");
      indicator.innerHTML = "<span>" + (type === "checkIn" ? "Station " : "Lane ") + (index + 1) + "</span><strong></strong>";
      indicators.append(indicator);
    });
    for (const action of ["open", "close"]) {
      panel.querySelector('[data-staffing="' + action + '"]').addEventListener("click", () => changeStaffing(type, action));
    }
  }
  const flightUpgrade = $("#flight-upgrade");
  flightUpgrade.addEventListener("click", () => changeStaffing("security", "open", true));
  $("#fast-forward-toggle").addEventListener("click", () => {
    state.speed = state.speed === fastForwardSpeed ? 1 : fastForwardSpeed;
    paint();
  });
  function zoom(factor, anchor) {
    if (!renderer) return;
    const {view} = renderer;
    const next = Math.max(.65, Math.min(maxMapZoom(), view.zoom * factor));
    if (next === view.zoom) return;
    const [x, y] = anchor ?? [view.width / 2, view.height / 2];
    const multiplier = next / view.zoom - 1;
    view.x += (view.width * .495 + view.x - x) * multiplier;
    view.y += (view.height * .51 + view.y - y) * multiplier;
    view.zoom = next;
    requestDraw = true;
  }
  function maxMapZoom() {
    return mobileLayout.matches ? 5.2 : 2.7;
  }
  function mapFitZoom() {
    return mobileLayout.matches && window.innerHeight > window.innerWidth ? 1.82 : 1;
  }
  function fit() {
    if (renderer) Object.assign(renderer.view, {zoom: fittedZoom, x: 0, y: 0});
    requestDraw = true;
  }
  $("#zoom-in").addEventListener("click", () => zoom(1.22));
  $("#zoom-out").addEventListener("click", () => zoom(1 / 1.22));
  $("#reset-view").addEventListener("click", fit);
  const canvas = $("#scene");
  if (renderer) {
    const pointers = new Map();
    const dragThreshold = 6;
    const touchOffsets = [[8, 0], [-8, 0], [0, 8], [0, -8]];
    let tapOrigin = null;

    function mapPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {x: event.clientX - rect.left, y: event.clientY - rect.top};
    }

    function aircraftAt({x, y}, touch) {
      const hit = renderer.pickAircraft(x, y);
      if (hit || !touch) return hit;
      for (const [dx, dy] of touchOffsets) {
        const nearby = renderer.pickAircraft(x + dx, y + dy);
        if (nearby) return nearby;
      }
      return null;
    }

    function pan(dx, dy) {
      const {view} = renderer;
      const range = Math.max(1.5, view.zoom * .55);
      view.x = Math.max(-view.width * range, Math.min(view.width * range, view.x + dx));
      view.y = Math.max(-view.height * range, Math.min(view.height * range, view.y + dy));
      requestDraw = true;
    }

    canvas.addEventListener("wheel", event => {
      event.preventDefault();
      const {x, y} = mapPoint(event);
      zoom(Math.exp(-Math.max(-72, Math.min(72, event.deltaY)) * .003), [x, y]);
    }, {passive: false});
    canvas.addEventListener("pointerdown", event => {
      const touch = event.pointerType === "touch";
      if (event.button !== 0 || pointers.size >= 2 ||
        (pointers.size && (!touch || !pointers.values().next().value.touch))) return;
      const point = {...mapPoint(event), touch};
      pointers.set(event.pointerId, point);
      tapOrigin = pointers.size === 1 ? {...point, flightId: touch ? null : aircraftAt(point, false)} : null;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
      const point = pointers.get(event.pointerId);
      const next = mapPoint(event);
      if (!point) {
        if (!pointers.size && event.pointerType === "mouse") {
          canvas.toggleAttribute("data-aircraft-hover", Boolean(aircraftAt(next, false)));
        }
        return;
      }
      const dx = next.x - point.x, dy = next.y - point.y;
      if (pointers.size === 2) {
        const [first, second] = pointers.values();
        const other = point === first ? second : first;
        const distance = Math.hypot(point.x - other.x, point.y - other.y);
        const nextDistance = Math.hypot(next.x - other.x, next.y - other.y);
        if (distance > 0 && nextDistance > 0) {
          zoom(nextDistance / distance, [(point.x + other.x) / 2, (point.y + other.y) / 2]);
        }
        pan(dx / 2, dy / 2);
      } else {
        if (tapOrigin && Math.hypot(dx, dy) < dragThreshold) return;
        tapOrigin = null;
        pan(dx, dy);
      }
      Object.assign(point, next);
    });
    canvas.addEventListener("pointerup", event => {
      if (!pointers.delete(event.pointerId)) return;
      const origin = tapOrigin;
      tapOrigin = null;
      if (!origin) return;
      const point = mapPoint(event);
      if (Math.hypot(point.x - origin.x, point.y - origin.y) >= dragThreshold) return;
      const flightId = origin.touch ? aircraftAt(point, true) : origin.flightId;
      if (state.flights.some(flight => flight.id === flightId)) selectFromMap(flightId);
    });
    function cancelPointer(event) {
      if (pointers.delete(event.pointerId)) tapOrigin = null;
    }
    canvas.addEventListener("pointercancel", cancelPointer);
    canvas.addEventListener("lostpointercapture", cancelPointer);
    canvas.addEventListener("pointerleave", () => canvas.removeAttribute("data-aircraft-hover"));
  }
  window.addEventListener("keydown", event => {
    if (report.open || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.code === "Space" && !["BUTTON", "INPUT", "TEXTAREA"].includes(event.target.tagName)) {
      event.preventDefault();
      togglePause();
    }
    if (event.key === "+" || event.key === "=") zoom(1.22);
    if (event.key === "-") zoom(1 / 1.22);
    if (event.key === "0") fit();
  });
  let fittedZoom = mapFitZoom();
  let requestDraw = true;
  let lastFrame = performance.now(), lastPaint = 0, lastDraw = 0;
  window.addEventListener("resize", () => {
    const {view} = renderer ?? {};
    const wasFitted = view?.zoom === fittedZoom && view.x === 0 && view.y === 0;
    fittedZoom = mapFitZoom();
    if (wasFitted) fit();
    else if (view?.zoom > maxMapZoom()) zoom(1);
    requestDraw = true;
  });
  function frame(timestamp) {
    update(Math.max(0, Math.min(.15, (timestamp - lastFrame) / 1000)));
    lastFrame = timestamp;
    const drawDue = requestDraw || (!shiftComplete() && !state.paused && timestamp - lastDraw >= 32);
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
  $("#objective-curfew").textContent = "Operating day · Curfew " + formatTime(curfewMinutes);
  if (savedOpening) announce(formatDay(savedOpening.day) + " restored at opening. Resume when ready.");
  fit();
  paint();
  requestAnimationFrame(frame);
})();
