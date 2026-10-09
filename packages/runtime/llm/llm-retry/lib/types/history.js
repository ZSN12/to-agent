"use strict";
/** Durable request-route lookup for one open model step. @module @z/dsh-llm-retry/history */
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerForOpenStep = providerForOpenStep;
/**
 * Find the provider in force for one currently open step.
 * Request headers remain effective across turn boundaries until a newer full
 * snapshot changes them; every provider change requires a newer full snapshot.
 * @param events - session events ending inside the open step.
 * @param turn - turn that owns the failed step.
 * @param step - failed step whose provider is required.
 * @returns the provider from the request header in force for the step.
 */
function providerForOpenStep(events, turn, step) {
    var stepStartIndex = events.findLastIndex(function (event) {
        return event.type === 'step/start'
            && event.data.turn === turn
            && event.data.step === step;
    });
    if (stepStartIndex < 0 || events.slice(stepStartIndex + 1).some(function (event) {
        return event.type === 'step/end' || event.type === 'turn/end';
    }))
        return undefined;
    for (var index = events.length - 1; index >= 0; index -= 1) {
        // The loop bounds prove this indexed read exists.
        // oxlint-disable-next-line typescript/no-non-null-assertion
        var event_1 = events[index];
        if (event_1.type === 'request/header')
            return event_1.data.header.config.provider;
    }
    return undefined;
}
