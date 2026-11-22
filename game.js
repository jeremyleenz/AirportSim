"use strict";

(() => {
  const $ = selector => document.querySelector(selector);
  const {gates, runwayZ, taxiwayZ, floor} = airport;
  const mobileLayout = window.matchMedia("(max-width: 760px), (pointer: coarse) and (max-height: 500px)");
  const game = $(".game");
  const currency = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 0});
  const startingCash = 124500;
  const staffingRates = {checkIn: 10, security: 15};
  const counterNames = {checkIn: "Check-in station", security: "Security lane"};
  const counterStatus = {open: "Open", closing: "Closing", closed: "Closed"};
  const handlingCost = 2000;
  const passengerFare = 41;
  const startMinutes = 8 * 60 + 42;
  const secondsPerMinute = 3.4;
  const fastForwardSpeed = 4;
  const scheduleVariationMinutes = 6;
  const minutesFromBoardingToTakeoff = 30;
  const earliestPassengerArrival = 70;
  const latestPassengerArrival = 40;
  const lateNoticeMinutes = 12;
  const takeoffWarningMinutes = 10;
  const departureGraceMinutes = 5;
  const finePerLateMinute = 25;
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
  // Times are minutes after opening. One aircraft is parked overnight and the first inbound is due in eight minutes.
  const scheduleSlots = [
    [0, 0, 214, null, 74], [1, 1, 507, 8, 92], [2, 2, 318, 29, 101],
    [3, 3, 126, 61, 118], [4, 0, 435, 76, 137],
    [5, 1, 201, 108, 171], [0, 2, 216, 124, 190], [1, 3, 509, 142, 207], [2, 0, 320, 166, 230],
    [3, 1, 128, 202, 278], [4, 2, 437, 248, 326], [5, 3, 203, 292, 355],
    [0, 0, 218, 326, 416], [1, 1, 511, 388, 478], [2, 2, 322, 450, 538], [3, 3, 130, 510, 602]
  ];

  function createTimetable() {
    return scheduleSlots.map(([route, airline, number, arrivalMinute, takeoffMinute], index) => {
      const [destination, passengers] = routes[route];
      // Offset arrival and takeoff together to preserve each flight's turnaround time.
      const offset = index < 2 ? 0 : Math.floor(Math.random() * (2 * scheduleVariationMinutes + 1)) - scheduleVariationMinutes;
      const arrivalAt = arrivalMinute === null ? null : (arrivalMinute + offset) * secondsPerMinute;
      const departureMinute = takeoffMinute + offset;
      const boardingAt = Math.max(0, departureMinute - minutesFromBoardingToTakeoff) * secondsPerMinute;
      const takeoffAt = departureMinute * secondsPerMinute;
      return {id: airlines[airline].code + number, destination, airline, passengers, arrivalAt, boardingAt, takeoffAt};
    }).sort((a, b) => a.takeoffAt - b.takeoffAt);
  }

  function lateArrivalTimes(takeoffAt) {
    if (Math.random() >= .25) return [];
    const count = 1 + Math.floor(Math.random() * 8);
    return Array.from({length: count}, () => {
      const timing = Math.random();
      const [earliest, latest] = timing < .7 ? [-26, -12] : timing < .9 ? [-12, -1] : [0, 7];
      const first = Math.max(earliest, -takeoffAt / secondsPerMinute);
      return takeoffAt + (first + (latest - first) * Math.random()) * secondsPerMinute;
    }).sort((a, b) => a - b);
  }

  function makeFlight(plan, index) {
    const {arrivalAt, takeoffAt, passengers} = plan;
    const gate = arrivalAt === null ? index : null;
    const stage = gate === null ? "scheduled" : "parked";
    const lateTimes = lateArrivalTimes(takeoffAt);
    const firstArrival = gate === null ? Math.max(0, takeoffAt - earliestPassengerArrival * secondsPerMinute) : 0;
    const lastArrival = Math.max(0, takeoffAt - latestPassengerArrival * secondsPerMinute);
    const manifest = passengerFlow.manifest(passengers, firstArrival, lastArrival, lateTimes);
    const incomingPassengers = arrivalAt === null ? 0 : Math.round(passengers * (.55 + index * 3 % 5 * .04));
    return {...plan, stage, gate, manifest, incomingPassengers};
  }

  function createShift() {
    const timetable = createTimetable();
    return {cash: startingCash, now: 0, speed: 1, paused: false, missedPassengers: 0, delayMinutes: 0,
      staffingCosts: {checkIn: 0, security: 0},
      timetable, flights: timetable.map(makeFlight), results: [], selected: timetable[0].id, view: "flights",
      movements: new Map(), taxiQueue: [], nextDeparture: null};
  }

  let state = createShift();
  const statusText = {
    scheduled: "Expected",
    parked: "At gate", deplaning: "Deplaning", boarding: "Boarding", closing: "Boarding closed", ready: "Ready", holding: "Holding",
    reserved: "Gate reserved", inbound: "Taxiing in", outbound: "Departing"
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
    const label = document.createElement(staffing ? "button" : "span");
    label.className = "map-note";
    label.textContent = text;
    const count = section ? addMapCount(label) : null;
    if (staffing) {
      label.type = "button";
      label.classList.add("map-staffing");
      label.dataset.staffingType = section;
      label.setAttribute("aria-controls", "staffing-" + section);
      label.title = "Open " + text.toLowerCase() + " staffing controls";
      label.addEventListener("click", () => revealStaffing(section));
    }
    $("#map-labels").append(label);
    return {element: label, x, y, z, count, section, decorative: !staffing};
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
    button.innerHTML = '<i aria-hidden="true"></i><span><span class="map-gate-info">' + name + '</span>' +
      '<span class="map-late-time" hidden></span></span>';
    const count = addMapCount(button.querySelector(".map-gate-info"));
    const late = button.querySelector(".map-late-time");
    button.addEventListener("click", () => {
      const flight = flightAtGate(gate);
      const arrivals = state.flights.filter(item => item.stage === "holding");
      const arrival = arrivals.find(item => item.id === state.selected) || arrivals[0];
      selectFromMap(flight?.id || arrival?.id || "gate-" + gate, gate);
    });
    if (renderer) $("#map-labels").append(button);
    return {element: button, x: x + 2.9, y: 2.85, z: 7.93, count, late};
  });
  const mapSigns = renderer ? [
    createLabel("ENTRANCE", -2.2, 1.1, 34.1),
    createLabel("ARRIVALS EXIT", airport.terminalPaths.airsideExit.x, 1.2, 30.9),
    createLabel("CAFÉ", -26, 1.84, 19.05, "cafe"),
    createLabel("SHARED SEATS", -12.5, 1, 16.55, "sharedSeats"),
    createLabel("SECURITY", -.7, 2.75, 19.1, "security"),
    createLabel("CHECK-IN", 25, 4.6, 21.2, "checkIn"),
    createLabel("DEPARTURES", 13.3, 1.65, 16.9, "concourse"),
    createLabel("RWY 09 / 27", -22, .05, runwayZ - 9.4)
  ] : [];
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

  function select(id, stand = null) {
    const arrival = state.flights.find(flight => flight.id === id && flight.stage === "holding");
    if (arrival) {
      const choice = stand ?? arrival.preferredGate ?? availableGate();
      if (choice >= 0 && !flightAtGate(choice)) arrival.preferredGate = choice;
    }
    state.selected = id;
    state.view = "flights";
    paint();
    requestDraw = true;
  }

  function showMobileView(view) {
    game.dataset.mobileView = view;
    $("#show-map").setAttribute("aria-pressed", String(view === "map"));
    $("#show-operations").setAttribute("aria-pressed", String(view === "operations"));
    requestDraw = true;
  }

  function revealFlight(focus = true) {
    const entry = flightElements.get(state.selected);
    (entry?.card ?? flightDetail).scrollIntoView({block: "nearest"});
    if (focus) (entry?.button ?? $("#stand-title")).focus({preventScroll: true});
  }

  function selectFromMap(id, stand = null) {
    select(id, stand);
    if (mobileLayout.matches) {
      showMobileView("operations");
    }
    revealFlight(mobileLayout.matches);
  }

  function notifyTab(view) {
    if (state.view !== view) $(".panel-body").scrollTop = 0;
    state.view = view;
    paint();
  }

  function revealStaffing(type) {
    notifyTab("terminal");
    if (mobileLayout.matches) showMobileView("operations");
    const panel = $("#staffing-" + type);
    panel.scrollIntoView({block: "nearest"});
    panel.querySelector("h3").focus({preventScroll: true});
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
    return state.results.length === state.timetable.length;
  }

  function availableGate() {
    return gates.findIndex((_, index) => !flightAtGate(index));
  }

  function selectedGate() {
    const flight = state.flights.find(item => item.id === state.selected);
    if (flight?.stage === "outbound" && flightAtGate(flight.gate) !== flight) return -1;
    if (flight?.gate != null) return flight.gate;
    if (flight?.stage === "holding") {
      if (flight.preferredGate === undefined) return availableGate();
      return flightAtGate(flight.preferredGate) ? -1 : flight.preferredGate;
    }
    return state.selected?.startsWith("gate-") ? Number(state.selected.slice(5)) : -1;
  }

  const flightElements = new Map();
  const flightDetail = $("#flight-detail");
  const delayNotice = $("#departure-delay-notice");
  const gatePicker = $("#gate-picker");
  const gateOptions = gates.map(({name}, index) => {
    const label = document.createElement("label");
    label.className = "gate-option";
    label.innerHTML = '<input type="radio" name="arrival-gate">' +
      '<span class="gate-choice"><strong>' + name + '</strong><small></small></span>';
    const input = label.querySelector("input");
    input.value = index;
    input.addEventListener("change", () => select(state.selected, index));
    $("#gate-options").append(label);
    return {input, status: label.querySelector("small")};
  });

  function paintGatePicker(flight, gate) {
    gatePicker.hidden = flight?.stage !== "holding";
    if (gatePicker.hidden) return;
    gateOptions.forEach(({input, status}, index) => {
      const occupant = flightAtGate(index);
      input.disabled = Boolean(occupant);
      input.checked = index === gate;
      status.textContent = !occupant ? "Open"
        : occupant.stage === "reserved" || occupant.stage === "inbound" ? "Reserved" : "Occupied";
    });
  }

  function clockMinutes(seconds) {
    return startMinutes + Math.floor(seconds / secondsPerMinute + 1e-9);
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
  }

  function takeoffSchedule(flight) {
    if (!flight) return null;
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
      const arrival = arrivalAt === null ? '<span class="schedule-initial">At gate</span>' : scheduleTime(arrivalAt);
      row.innerHTML = '<th scope="row"><button type="button" class="schedule-flight">' + destination +
        '</button><span class="schedule-destination" hidden>' + destination + '</span><span class="schedule-id">' +
        id + '<span class="schedule-gate"></span></span></th><td>' + arrival + '</td><td>' + scheduleTime(boardingAt) +
        '</td><td>' + scheduleTime(takeoffAt) + '<span class="schedule-status"></span></td>';
      const button = row.querySelector("button");
      button.setAttribute("aria-label", "Open " + destination + " " + id + " on flight board");
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
    $("#schedule-hours").textContent = formatTime(startMinutes) + "–" + formatTime(clockMinutes(timetable.at(-1).takeoffAt));
    return rows;
  }

  let scheduleRows = buildScheduleRows();

  function paintSchedule() {
    const active = new Map(state.flights.map(flight => [flight.id, flight]));
    const departed = new Map(state.results.map(result => [result.id, result]));
    for (const {id, row, button, destinationLabel, gateLabel, status} of scheduleRows) {
      const flight = active.get(id);
      const result = departed.get(id);
      const gate = flight && gates[flight.gate];
      button.hidden = !flight;
      destinationLabel.hidden = Boolean(flight);
      gateLabel.textContent = gate ? " · " + gate.name : "";
      row.dataset.stage = flight?.stage ?? "departed";
      row.dataset.late = result && result.takeoff > result.due ? "true" : "false";
      status.textContent = result ? "Left " + formatTime(result.takeoff) : flightStatus(flight);
      status.hidden = flight?.stage === "scheduled";
    }
  }

  function paintFlightProgress(button, flight) {
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

  function paintLateAlert() {
    const alert = $("#late-flight-alert");
    const flights = state.flights.filter(notifiedLatePassengers);
    const flight = flights.at(-1);
    alert.hidden = !flight;
    if (!flight) {
      delete alert.dataset.flight;
      return;
    }
    const message = flight.id + " · " + latePassengerLabel(notifiedLatePassengers(flight));
    const label = flights.length > 1 ? message + " · +" + (flights.length - 1) + " flights" : message;
    if (alert.textContent !== label) alert.textContent = label;
    if (alert.dataset.flight !== flight.id) announce(message + ". Open the flight to review boarding.");
    alert.dataset.flight = flight.id;
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
      button.querySelector("strong").textContent = arriving ? "To " + flight.destination : flight.destination;
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
      if (!boarding.hidden) {
        boarding.querySelector(".boarding-label").textContent = state.now >= flight.boardingAt
          ? "Boarding due" : "Boarding time";
      }
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
    return Math.max(0, lateMinutes - departureGraceMinutes) * finePerLateMinute;
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
    action.hidden = !flight || ["boarding", "deplaning", "scheduled"].includes(flight.stage);
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
    if (arriving) {
      $("#detail-content").insertAdjacentHTML("beforeend", '<div class="flow-stats">' +
        stat("Passengers in terminal", (passengers - counts.outside) + " / " + passengers) + '</div>');
    }
    const {lateOutside, lateInTerminal} = counts;
    const lateWaiting = notifiedLatePassengers(flight);
    const schedule = takeoffSchedule(flight);
    delayNotice.hidden = !lateWaiting && !schedule?.urgency;
    if (!delayNotice.hidden) {
      const fine = departureFine(schedule?.lateMinutes ?? 0);
      const rate = currency.format(finePerLateMinute) + "/min";
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
    const readyAction = flight === nextDeparture ? "Release next takeoff slot"
      : nextDeparture ? "Take " + nextDeparture.id + "’s runway slot"
      : stage === "ready" && !canStartTaxi(outboundMovement(flight)) ? "Reserve next takeoff slot"
      : "Clear for departure";
    const labels = {
      parked: "Start boarding",
      closing: "Finishing boarding",
      ready: readyAction,
      holding: gate >= 0 ? "Assign gate " + gates[gate].name
        : availableGate() >= 0 ? "Choose an open gate" : "No open gates",
      reserved: "Waiting for taxi clearance",
      inbound: "Taxiing to gate", outbound: "Departure in progress"
    };
    action.textContent = labels[stage] ?? "";
    action.disabled = stage !== "parked" && stage !== "ready" &&
      !(stage === "holding" && gate >= 0);
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
    paintOpenStaffing(openButton, type, type === "checkIn" ? "station" : "lane");
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

  function paint() {
    if (occupancyDirty) {
      occupancy = passengerFlow.snapshot(state.flights, flow);
      occupancyDirty = false;
      requestDraw = true;
    }
    const minutes = clockMinutes(state.now);
    const time = formatTime(minutes);
    const dispatched = state.results.length;
    const satisfaction = Math.min(100, Math.max(55, 84 + dispatched * 2 -
      Math.floor((occupancy.security.length - 38) / 16) - Math.ceil(state.missedPassengers / 5) - Math.floor(state.delayMinutes / 5)));
    const staffingSpent = staffingCost("checkIn") + staffingCost("security");
    $("#cash").textContent = currency.format(state.cash - staffingSpent);
    $("#passengers").textContent = occupancy.total;
    $("#satisfaction").textContent = satisfaction + "%";
    $(".clock-day").textContent = "DAY " + String(1 + Math.floor(minutes / 1440)).padStart(2, "0");
    $("#clock").textContent = time;
    $("#clock").setAttribute("datetime", time);
    const complete = shiftComplete();
    $("#run-label").textContent = complete ? "Complete" : state.paused ? "Paused" : "Running";
    $("#run-label").classList.toggle("paused", state.paused && !complete);
    $("#pause-icon").setAttribute("href", state.paused ? "#play" : "#pause");
    $("#pause-toggle").setAttribute("aria-label", state.paused ? "Resume simulation" : "Pause simulation");
    $("#pause-toggle").disabled = complete;
    const fastForward = $("#fast-forward-toggle");
    fastForward.disabled = complete;
    fastForward.setAttribute("aria-pressed", String(!complete && state.speed === fastForwardSpeed));
    const terminalOpen = state.view === "terminal";
    const scheduleOpen = state.view === "schedule";
    const flightsOpen = state.view === "flights";
    $("#terminal-tab").setAttribute("aria-pressed", String(terminalOpen));
    $("#schedule-tab").setAttribute("aria-pressed", String(scheduleOpen));
    $("#flights-tab").setAttribute("aria-pressed", String(flightsOpen));
    $("#terminal-view").hidden = !terminalOpen;
    $("#schedule-view").hidden = !scheduleOpen;
    $("#flight-view").hidden = !flightsOpen || complete;
    paintFlights();
    paintDetail();
    paintLateAlert();
    if (scheduleOpen) paintSchedule();
    if (terminalOpen) {
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
      $("#lounge-counts").querySelectorAll("b").forEach((count, index) => {
        count.textContent = occupancy.gates[index].length;
      });
    }
    const flightCount = state.timetable.length;
    $("#goal-bar").style.width = dispatched / flightCount * 100 + "%";
    $("#goal-count").textContent = dispatched + " / " + flightCount;
    $("#objective-title").textContent = complete ? "Operating day complete" : "Dispatch " + flightCount + " flights";
    $("#view-report").hidden = !complete;

    const gate = selectedGate();
    mapPins.forEach(({element, count, late}, index) => {
      const flight = flightAtGate(index);
      const waiting = occupancy.gates[index].length;
      const schedule = flight?.stage === "inbound" ? null : takeoffSchedule(flight);
      const delay = paintMapDelay(element, late, schedule);
      count.textContent = waiting;
      element.dataset.state = flight?.stage || "free";
      element.setAttribute("aria-pressed", String(gate === index));
      element.setAttribute("aria-label", "Gate " + gates[index].name + ", " +
        (flight ? flightStatus(flight) : "available") + ", " + waiting + " waiting" + delay);
    });
    const waiting = holdingFlights();
    const holding = flightAtHoldingPoint(waiting);
    if (holding) {
      const route = holding.id + " to " + holding.destination;
      const schedule = takeoffSchedule(holding);
      const delay = paintMapDelay(holdingPin, holdingPinLate, schedule);
      const {time} = schedule;
      holdingPinRoute.textContent = route;
      holdingPinSchedule.hidden = Boolean(delay);
      holdingPinTime.dateTime = time;
      holdingPinTime.textContent = time;
      holdingPin.setAttribute("aria-pressed", String(holding.id === state.selected));
      holdingPinCount.hidden = waiting.length === 1;
      holdingPinCount.textContent = waiting.length;
      holdingPin.setAttribute("aria-label", waiting.length + " awaiting taxi-in. " + route + ". Takeoff at " + time + delay);
    }
    for (const {count, section} of mapSigns) {
      if (count) count.textContent = occupancy[section].length;
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

  const outboundRoutes = gates.map(({x}) => {
    const halfTurn = Math.PI / 2;
    const path = timedTaxiPath([
      [x, -4.75, 0], [x, -15, 0, pushbackSpeed], [x - 2.1, -22, -halfTurn, pushbackSpeed],
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

  const inboundRoutes = gates.map(({x}) => {
    const path = timedTaxiPath([
      [holdingPosition.x, holdingPosition.z, holdingPosition.angle],
      [x + 6, taxiwayZ, holdingPosition.angle], [x + 1.8, -21.2, -.77],
      [x, -17, 0], [x, -4.75, 0]
    ]);
    return {duration: path.at(-1)[0], path};
  });

  function outboundMovement(flight) {
    return {flight, start: state.now, ...outboundRoutes[flight.gate]};
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
    return movement ? positionAlongPath(movement) : {x: gates[flight.gate].x, z: -4.75};
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
    const flight = state.flights.find(item => item.id === state.selected);
    if (!flight || $("#flight-action").disabled) return;
    if (flight.stage === "parked") {
      flight.stage = "boarding";
      announce("Boarding started at " + gates[flight.gate].name + ".");
    } else if (flight.stage === "ready") {
      if (state.nextDeparture === flight) {
        state.nextDeparture = null;
        announce(flight.id + " released the next takeoff slot.");
      } else {
        const movement = outboundMovement(flight);
        if (canStartTaxi(movement)) {
          startTaxi(movement);
        } else {
          state.nextDeparture = flight;
          announce(flight.id + " has the next takeoff slot.");
        }
      }
    } else if (flight.stage === "holding") {
      const gate = selectedGate();
      if (gate < 0) return;
      flight.gate = gate;
      flight.stage = "reserved";
      state.taxiQueue.push(flight);
      releaseTaxiIn();
      if (flight.stage === "reserved") {
        announce(gates[gate].name + " reserved for " + flight.id + ".");
      }
    }
    paint();
  }

  function closeSelectedBoarding() {
    const flight = state.flights.find(item => item.id === state.selected);
    if (flight?.stage !== "boarding" || $("#close-boarding").hidden) return;
    const missed = passengerFlow.closeBoarding(flight, flow);
    state.missedPassengers += missed;
    flight.stage = flight.manifest.some(person => person.zone === "boarding") ? "closing" : "ready";
    occupancyDirty = true;
    announce(flight.id + " boarding closed. " + missed + " missed the flight.");
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
    state.flights = state.flights.filter(item => item !== flight);
    if (state.selected === flight.id) state.selected = state.flights[0]?.id || "gate-" + flight.gate;
    if (shiftComplete()) {
      state.paused = true;
      announce("Operating day complete. Your shift report is ready.");
      paint();
      showShiftReport();
    } else {
      const fineMessage = fine ? " (" + currency.format(fine) + " late fine)" : "";
      announce(flight.id + " airborne with " + boarded + " passengers. " + currency.format(net) + " net" + fineMessage + ".");
    }
  }

  function advanceShift(simDelta) {
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
        flight.stage = "parked";
        announce(flight.id + " finished deplaning. Boarding can begin.");
      });
    occupancyDirty ||= changed;
    for (const [flight, movement] of state.movements) {
      if (movementElapsed(movement) < movement.duration) continue;
      state.movements.delete(flight);
      occupancyDirty = true;
      if (flight.stage === "inbound") {
        flight.stage = "deplaning";
        passengerFlow.startDeplaning(flight, state.now);
        announce(flight.id + " deplaning at " + gates[flight.gate].name + ".");
      } else {
        finishDeparture(movement);
        if (shiftComplete()) return;
      }
    }
    if (state.nextDeparture) {
      const movement = outboundMovement(state.nextDeparture);
      if (canStartTaxi(movement)) startTaxi(movement);
    }
    releaseTaxiIn();
    for (const flight of state.flights) {
      if (flight.stage === "scheduled" && state.now >= flight.arrivalAt) {
        flight.stage = "holding";
        occupancyDirty = true;
        announce(flight.id + " awaiting a gate assignment.");
      }
    }
  }

  function update(dt) {
    if (state.paused) return;
    let remaining = dt * state.speed;
    // Keep queue processing and walking on small steps at accelerated speeds.
    while (remaining > 0 && !shiftComplete()) {
      const step = Math.min(remaining, .05);
      advanceShift(step);
      remaining -= step;
    }
  }

  const report = $("#shift-report");

  function showShiftReport() {
    const results = state.results.slice().sort((a, b) => a.due - b.due);
    const onTime = results.filter(({due, takeoff}) => takeoff <= due).length;
    const revenue = results.reduce((total, flight) => total + flight.revenue, 0);
    const fines = results.reduce((total, flight) => total + flight.fine, 0);
    const handling = results.length * handlingCost;
    const checkIn = staffingCost("checkIn");
    const security = staffingCost("security");
    $("#report-on-time").textContent = onTime + " / " + results.length;
    $("#report-missed").textContent = results.reduce((total, flight) => total + flight.missed, 0);
    $("#report-profit").textContent = currency.format(revenue - handling - checkIn - security - fines);
    $("#report-delays").innerHTML = stat("Total departure delay", state.delayMinutes + " min");
    $("#report-finances").innerHTML = stat("Flight revenue", currency.format(revenue)) +
      stat("Ground handling", currency.format(-handling)) + stat("Extra check-in staffing", currency.format(0 - checkIn)) +
      stat("Extra security staffing", currency.format(0 - security)) + stat("Late takeoff fines", currency.format(0 - fines));
    $("#report-flights").innerHTML = results.map(({id, destination, due, takeoff, missed, fine}) => {
      const fineLabel = fine ? " · " + currency.format(fine) + " fine" : "";
      const lateLabel = takeoff > due ? '<span class="report-late">+' + (takeoff - due) + ' min' + fineLabel + '</span>' : "";
      return '<tr><th scope="row">' + id + '<span>' + destination + '</span></th><td>' + formatTime(due) +
        '</td><td>' + formatTime(takeoff) + lateLabel + '</td><td>' + missed + '</td></tr>';
    }).join("");
    report.showModal();
  }

  const aircraftSelection = $("#aircraft-selection");
  const aircraftDelayPins = new Map();
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
        pin.addEventListener("click", () => selectFromMap(flight.id));
        $("#map-labels").append(pin);
        aircraftDelayPins.set(flight.id, pin);
      }
      const text = flight.id + " · " + schedule.message;
      if (pin.textContent !== text) pin.textContent = text;
      pin.setAttribute("aria-pressed", String(flight.id === state.selected));
      const {left, right, top} = renderer.projectBounds(object);
      const x = (left + right) / 2;
      pin.hidden = x < 18 || x > renderer.view.width - 18 || top < 30 || top > renderer.view.height;
      pin.style.left = Math.max(70, Math.min(renderer.view.width - 70, x)) + "px";
      pin.style.top = (top - 6) + "px";
    }
    for (const [id, pin] of aircraftDelayPins) {
      if (active.has(id)) continue;
      pin.remove();
      aircraftDelayPins.delete(id);
    }
  }

  function draw() {
    if (!renderer || (mobileLayout.matches && game.dataset.mobileView === "operations")) return;
    const holding = flightAtHoldingPoint();
    const aircraft = state.flights.filter(flight => !isArriving(flight) || flight.stage === "inbound" || flight === holding)
      .map(flight => ({mesh: planes[flight.airline], ...aircraftPosition(flight), flightId: flight.id, flight}));
    const moving = aircraft.slice();
    const selectedAircraft = aircraft.find(object => object.flightId === state.selected);
    const carTravel = state.now * 2.4;
    for (const vehicle of scene.traffic) {
      const direction = Math.sign(vehicle.angle);
      const x = ((vehicle.offset + carTravel) % 110 - 55) * direction;
      moving.push({...vehicle, x});
    }
    const people = airport.passengerActors(scene.outfits, occupancy);
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
    renderer.render([...scene.fixed, ...moving, ...people]);
    showAircraftSelection(selectedAircraft);
    drawAircraftDelays(aircraft);
    for (const {x, y, z, element, decorative} of [...mapPins, ...mapSigns, holdingPinPosition]) {
      const [left, top] = renderer.project(x, y, z);
      element.style.left = left + "px";
      element.style.top = top + "px";
      element.hidden = left < 18 || top < 19 || left > renderer.view.width - 18 || top > renderer.view.height - 18 ||
        (decorative && renderer.view.width < 520) ||
        (element === holdingPin && (!holding || left < 90 || left > renderer.view.width - 90));
    }
  }

  function togglePause() {
    if (shiftComplete()) return;
    state.paused = !state.paused;
    paint();
  }

  $("#flights-tab").addEventListener("click", () => notifyTab("flights"));
  $("#schedule-tab").addEventListener("click", () => notifyTab("schedule"));
  $("#terminal-tab").addEventListener("click", () => notifyTab("terminal"));
  $("#late-flight-alert").addEventListener("click", () => {
    const id = $("#late-flight-alert").dataset.flight;
    if (!id) return;
    select(id);
    if (mobileLayout.matches) showMobileView("operations");
    revealFlight();
  });
  $("#show-map").addEventListener("click", () => showMobileView("map"));
  $("#show-operations").addEventListener("click", () => showMobileView("operations"));
  $("#flight-action").addEventListener("click", command);
  $("#close-boarding").addEventListener("click", closeSelectedBoarding);
  $("#pause-toggle").addEventListener("click", togglePause);
  $("#view-report").addEventListener("click", showShiftReport);
  $("#close-report").addEventListener("click", () => report.close());
  $("#restart-shift").addEventListener("click", () => {
    state = createShift();
    scheduleRows = buildScheduleRows();
    flow = passengerFlow.create();
    occupancyDirty = true;
    $("#upcoming").open = false;
    report.close();
    $(".panel-body").scrollTop = 0;
    showMobileView("map");
    fit();
    announce("Terminal open. Passengers are arriving.");
    paint();
    (mobileLayout.matches ? $("#show-operations") : $("#flights-tab")).focus({preventScroll: true});
  });
  report.addEventListener("close", () => {
    if (!shiftComplete()) return;
    if (mobileLayout.matches) showMobileView("operations");
    $("#view-report").focus();
  });
  function changeStaffing(type, action) {
    if (shiftComplete()) return;
    const bank = action === "open" ? passengerFlow.openCounter(flow, type) : passengerFlow.closeCounter(flow, type);
    if (!bank) return;
    const label = counterNames[type] + " " + (flow[type].indexOf(bank) + 1);
    announce(label + (bank.status === "closing" ? " will close after its queue clears." : " is now " + bank.status + "."));
    occupancyDirty = true;
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
  flightUpgrade.addEventListener("click", () => changeStaffing("security", "open"));
  $("#fast-forward-toggle").addEventListener("click", () => {
    state.speed = state.speed === fastForwardSpeed ? 1 : fastForwardSpeed;
    paint();
  });
  function zoom(factor, anchor) {
    if (!renderer) return;
    const {view} = renderer;
    const next = Math.max(.65, Math.min(2.7, view.zoom * factor));
    const [x, y] = anchor ?? [view.width / 2, view.height / 2];
    const multiplier = next / view.zoom - 1;
    view.x += (view.width * .495 + view.x - x) * multiplier;
    view.y += (view.height * .51 + view.y - y) * multiplier;
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
      view.x = Math.max(-view.width * 1.5, Math.min(view.width * 1.5, view.x + dx));
      view.y = Math.max(-view.height * 1.5, Math.min(view.height * 1.5, view.y + dy));
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
  let requestDraw = true;
  let lastFrame = performance.now(), lastPaint = 0, lastDraw = 0;
  window.addEventListener("resize", () => { requestDraw = true; });
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
  paint();
  requestAnimationFrame(frame);
})();
