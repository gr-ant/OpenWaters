'use strict';
// How well a spot suits a species (habitatScore, envAt), what food is where (foodAvail, foodScore), prey and activity
// curves: the shared simulation's (src/sim/environment.js), for the game's world (SIM), under their old global names.
const { fishFloor, habitatScore, envAt, FOOD_ZONES, FOOD_KIND, FOOD_COVER, foodAvail, foodScore, preyFood, activityAt } = SIM;
