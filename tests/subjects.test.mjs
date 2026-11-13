import test from 'node:test';
import assert from 'node:assert/strict';
import {questionSubject,subjectKey,practiceSubjects} from '../dist/subjects.mjs';
test('recognizes course codes inside imported and shared document names',()=>{
 assert.equal(questionSubject({sourceName:'Sever_1_SEMESTER_3_DBI202'}),'DBI202');
 assert.equal(questionSubject({sourceName:'jpd113 - đề ôn'}),'JPD113');
 assert.equal(questionSubject({sourceName:'[PRN212] Review'}),'PRN212');
 assert.equal(questionSubject({sourceName:'Học kỳ 3 - 2026'}),'');
});
test('combines multiple documents of one subject without mixing unknown sources',()=>{
 const questions=[{sourceId:'one',sourceName:'DBI202 slides'},{sourceId:'two',sourceName:'Review_DBI202'},{sourceId:'three',sourceName:'JPD113'},{sourceId:'four',sourceName:'Other'},{sourceId:'five',sourceName:'Other'}];
 const groups=practiceSubjects(questions);
 assert.equal(groups.find(g=>g.key==='DBI202').count,2);
 assert.equal(groups.length,4);
 assert.equal(questions.filter(q=>subjectKey(q)==='DBI202').length,2);
 assert.notEqual(subjectKey(questions[3]),subjectKey(questions[4]));
});
