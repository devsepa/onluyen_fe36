import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GOOGLE_CLIENT_ID,resolveGoogleClientId} from '../dist/site-config.mjs';
test('fresh visitors use the shared deployment configuration without local setup',()=>{
 assert.match(GOOGLE_CLIENT_ID,/\.apps\.googleusercontent\.com$/);
 assert.equal(resolveGoogleClientId(undefined,{getItem:()=>null}),GOOGLE_CLIENT_ID);
});
test('deployment configuration takes precedence and does not require storage access',()=>{
 assert.equal(resolveGoogleClientId(undefined,{getItem:()=>{throw Error('Storage blocked')}}),GOOGLE_CLIENT_ID);
 assert.equal(resolveGoogleClientId('shared.apps.googleusercontent.com',{getItem:()=> 'old.apps.googleusercontent.com'}),'shared.apps.googleusercontent.com');
});
test('legacy valid configuration is supported without displaying a setup form',()=>{
 assert.equal(resolveGoogleClientId('',{getItem:()=> ' old.apps.googleusercontent.com '}),'old.apps.googleusercontent.com');
 assert.equal(resolveGoogleClientId('',{getItem:()=> 'not-a-client'}),null);
 assert.equal(resolveGoogleClientId('',{getItem:()=>{throw Error('Storage blocked')}}),null);
});
