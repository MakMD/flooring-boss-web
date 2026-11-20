import test from 'node:test';
import assert from 'node:assert/strict';
import { needsMaterialPickup, pickupFieldsForCreate } from '../src/utils/servicePickup.js';
import { fileName, isImageFile } from '../src/utils/filePresentation.js';

test('Pickup applies only to services and a real boolean flag', () => {
  assert.equal(needsMaterialPickup({project_type:'Service', material_pickup_required:true}),true);
  for (const value of [false, undefined, null, 'true']) assert.equal(needsMaterialPickup({project_type:'Service',material_pickup_required:value}),false);
  assert.equal(needsMaterialPickup({project_type:'Address',material_pickup_required:true}),false);
});
test('Older database preserves normal creation and refuses silent loss of pickup flag', async () => {
  assert.deepEqual(await pickupFieldsForCreate({}, {project_type:'Service'}),{});
  let checks = 0;
  const client = error => ({from(table){assert.equal(table,'addresses');return {select(field){assert.equal(field,'material_pickup_required');return {async limit(count){assert.equal(count,0);checks++;return {error};}};}};}});
  const values = {project_type:'Service',material_pickup_required:true};
  await assert.rejects(pickupFieldsForCreate(client({code:'42703'}),values),/Сервіс не створено/);
  assert.deepEqual(await pickupFieldsForCreate(client(null),values),{material_pickup_required:true});
  assert.equal(checks,2);
});
test('File previews recognize image extensions without exposing URL tokens as names', () => {
  assert.equal(fileName('https://example.test/sign/bucket/Room%20One.JPG?token=synthetic'),'Room One.JPG');
  for (const path of ['material-photos/test.jpg','https://example.test/photo.PNG?token=test','photo.avif','nested/photo%2Ewebp']) assert.equal(isImageFile(path),true);
  for (const path of ['', 'document.pdf', 'file.svg', 'document.pdf?name=photo.jpg']) assert.equal(isImageFile(path),false);
  assert.equal(fileName('bad%name.jpg'),'bad%name.jpg');
});
