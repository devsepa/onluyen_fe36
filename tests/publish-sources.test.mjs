import test from 'node:test';import assert from 'node:assert/strict';
import {publishSources,questionsForPublish} from '../dist/publish-sources.mjs';
test('publishing never mixes sources, even with matching names',()=>{const bank=[{id:'a',sourceId:'one',sourceName:'Same'},{id:'b',sourceId:'two',sourceName:'Same'},{id:'c',sourceId:'one',sourceName:'Same'}];assert.equal(publishSources(bank).length,2);assert.deepEqual(questionsForPublish(bank,'one').map(q=>q.id),['a','c']);assert.deepEqual(questionsForPublish(bank,''),[]);assert.deepEqual(questionsForPublish(bank,'removed'),[])});
