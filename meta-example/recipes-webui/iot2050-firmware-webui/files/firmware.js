/* global cockpit */
'use strict';

const command = '/usr/sbin/iot2050-fwmgr';
let activeTask = window.sessionStorage.getItem('iot2050FirmwareTask');
let taskRunning = false;

function applyShellStyle (style) {
  const selected = style || window.localStorage.getItem('shell:style') || 'auto';
  const dark = selected === 'dark' ||
    (selected === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('pf-v6-theme-dark', dark);
  document.documentElement.dataset.cockpitTheme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function installShellStyleSync () {
  applyShellStyle();
  window.addEventListener('storage', event => {
    if (event.key === 'shell:style') applyShellStyle(event.newValue);
  });
  window.addEventListener('cockpit-style', event => {
    applyShellStyle(event.detail?.style);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((window.localStorage.getItem('shell:style') || 'auto') === 'auto') applyShellStyle();
  });
}

installShellStyleSync();

function runManager (args) {
  return cockpit.spawn([command, ...args], { superuser: 'require', err: 'message' })
    .then(output => {
      const response = JSON.parse(output);
      if (!response.ok) throw new Error(response.error.message);
      return response.data;
    });
}

function stageFile (file) {
  const process = cockpit.spawn(
    [command, 'stage', '--name', file.name],
    { superuser: 'require', err: 'message', binary: true }
  );
  const reader = file.stream().getReader();
  const pump = () => reader.read().then(({ done, value }) => {
    if (done) {
      process.input(null);
      return process;
    }
    process.input(value);
    return pump();
  });
  return pump().then(output => {
    const text = typeof output === 'string' ? output : new TextDecoder().decode(output);
    const response = JSON.parse(text);
    if (!response.ok) throw new Error(response.error.message);
    return response.data;
  });
}

function detail (label, value) {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value ?? 'Unavailable';
  row.append(term, description);
  return row;
}

function showError (error) {
  const alert = document.getElementById('error');
  alert.textContent = error.message || String(error);
  alert.classList.remove('hidden');
}

async function inspectController () {
  const data = await runManager(['inspect', 'controller']);
  const details = document.getElementById('controller-details');
  details.replaceChildren(
    detail('Current version', data.current_version),
    detail('Bundled version', data.bundled_version),
    detail('Metadata SHA-1', data.metadata_sha1),
    detail('Actual SHA-256', data.actual_sha256),
    detail('Update needed', data.update_needed ? 'Yes' : 'No')
  );
  const status = document.getElementById('controller-status');
  status.textContent = data.status;
  status.className = `status ${data.integrity === false ? 'bad' : data.update_needed ? 'warn' : 'good'}`;
}

async function inspectModule () {
  const slot = Number(document.getElementById('module-slot').value);
  const data = await runManager(['inspect', 'module', '--payload', JSON.stringify({ slot })]);
  document.getElementById('module-details').replaceChildren(
    detail('Slot', data.slot),
    detail('Slot available', data.available ? 'Yes' : 'No'),
    detail('Chip A node', data.chip_a_node ? 'Available' : 'Unavailable'),
    detail('Chip B node', data.chip_b_node ? 'Available' : 'Unavailable')
  );
}

function setWriteControlsDisabled (disabled) {
  document.getElementById('update-system').disabled = disabled;
  document.getElementById('update-controller').disabled = disabled;
  document.getElementById('update-module').disabled = disabled;
}

function setSystemUpdateDisabled (disabled) {
  document.getElementById('update-system').disabled = disabled;
  document.getElementById('system-firmware').disabled = disabled;
}

async function updateSystemFileHint () {
  const file = document.getElementById('system-firmware').files[0];
  document.getElementById('system-file-hint').textContent = file
    ? `Selected package: ${file.name} (${file.size} bytes)`
    : 'Default package: checking image firmware…';
}

async function inspectRollback () {
  await runManager(['inspect', 'system', '--rollback']);
  document.getElementById('rollback-system').classList.remove('hidden');
}

async function startRollback () {
  const details = await runManager(['inspect', 'system', '--rollback']);
  if (!window.confirm(`Rollback System Firmware from the local backup created at ${details.created_at}?\n\nSHA-256: ${details.sha256}\n\nNo upload is required. Do not power off the device.`)) return;
  const task = await runManager(['rollback', 'system']);
  await pollTask(task.id);
}

async function cancelTask () {
  if (!activeTask) return;
  await runManager(['cancel', activeTask]);
  await pollTask(activeTask);
}

async function rebootDevice () {
  if (!window.confirm('Reboot the device now? Firmware activation may require this restart.')) return;
  await cockpit.spawn(['/usr/bin/systemctl', 'reboot'], { superuser: 'require', err: 'message' });
}

async function startSystemUpdate () {
  setSystemUpdateDisabled(true);
  let staged = null;
  try {
    const file = document.getElementById('system-firmware').files[0];
    if (file) staged = await stageFile(file);
    const payload = staged ? { token: staged.token } : { source: 'image-default' };
    if (!window.confirm('Update System Firmware now? The system will automatically check compatibility, verify the signature, create a backup, flash the firmware, and verify readback. Do not power off the device.')) {
      if (staged) await runManager(['staging-delete', staged.token]).catch(() => {});
      staged = null;
      return;
    }
    const task = await runManager(['start', 'system', '--payload', JSON.stringify(payload)]);
    staged = null;
    setSystemUpdateDisabled(true);
  await pollTask(task.id);
  } catch (error) {
    if (staged) await runManager(['staging-delete', staged.token]).catch(() => {});
    throw error;
  } finally {
    if (!taskRunning) setSystemUpdateDisabled(false);
  }
}

async function pollTask (taskId) {
  activeTask = taskId;
  taskRunning = true;
  window.sessionStorage.setItem('iot2050FirmwareTask', taskId);
  document.getElementById('task-panel').classList.remove('hidden');
  setWriteControlsDisabled(true);
  const task = await runManager(['task', taskId]);
  document.getElementById('task-title').textContent = `${task.provider} firmware update`;
  document.getElementById('task-message').textContent = task.error?.message || task.phase;
  const state = document.getElementById('task-state');
  state.textContent = task.state;
  state.className = `status ${task.state === 'succeeded' ? 'good' : task.state === 'failed' ? 'bad' : 'warn'}`;
  document.getElementById('cancel-task').classList.toggle('hidden', task.state !== 'queued');
  if (task.state === 'queued' || task.state === 'running') {
    window.setTimeout(() => pollTask(taskId).catch(showError), 1000);
  } else {
    taskRunning = false;
    window.sessionStorage.removeItem('iot2050FirmwareTask');
    setWriteControlsDisabled(false);
    if (task.state === 'succeeded' && task.provider === 'system' &&
        task.operation === 'update') {
      // The backup is created during the task. Refresh its capability now so
      // the rollback action becomes available without a page reload.
      await inspectRollback().catch(() => {
        document.getElementById('rollback-system').classList.add('hidden');
      });
    }
    if (task.result?.reboot_required) {
      document.getElementById('task-message').textContent += ' — Reboot is required to activate the firmware.';
      document.getElementById('reboot-device').classList.remove('hidden');
    }
  }
}

async function startControllerUpdate () {
  const details = await runManager(['inspect', 'controller']);
  const warning = `Update the EIO controller from ${details.current_version || 'unknown'} to ${details.bundled_version || 'unknown'}?\n\nSHA-256: ${details.actual_sha256}\n\nDo not power off the device during this operation.`;
  if (!window.confirm(warning)) return;
  const task = await runManager(['start', 'controller', '--payload', JSON.stringify({ source: 'image-default' })]);
  await pollTask(task.id);
}

async function startModuleUpdate () {
  const slot = Number(document.getElementById('module-slot').value);
  const fileA = document.getElementById('firmware-a').files[0];
  const fileB = document.getElementById('firmware-b').files[0];
  if (!fileA && !fileB) throw new Error('Select firmware for chip A or chip B.');
  setWriteControlsDisabled(true);
  const stagedTokens = [];
  try {
    const stagedA = fileA ? await stageFile(fileA) : null;
    const stagedB = fileB ? await stageFile(fileB) : null;
    if (stagedA) stagedTokens.push(stagedA.token);
    if (stagedB) stagedTokens.push(stagedB.token);
    const lines = [`Update module in slot ${slot}?`];
    if (stagedA) lines.push(`Chip A: ${stagedA.name} (${stagedA.size} bytes)\nSHA-256: ${stagedA.sha256}`);
    if (stagedB) lines.push(`Chip B: ${stagedB.name} (${stagedB.size} bytes)\nSHA-256: ${stagedB.sha256}`);
    lines.push('Do not power off the module during this operation.');
    if (!window.confirm(lines.join('\n\n'))) {
      await Promise.all(stagedTokens.map(token => runManager(['staging-delete', token]).catch(() => {})));
      stagedTokens.length = 0;
      return;
    }
    const task = await runManager(['start', 'module', '--payload', JSON.stringify({
      slot,
      firmware_a: stagedA?.token,
      firmware_b: stagedB?.token
    })]);
    stagedTokens.length = 0;
    await pollTask(task.id);
  } finally {
    await Promise.all(stagedTokens.map(token => runManager(['staging-delete', token]).catch(() => {})));
    if (!taskRunning) setWriteControlsDisabled(false);
  }
}

async function loadCapabilities () {
  document.getElementById('error').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('providers').classList.add('hidden');
  try {
    const capabilities = await runManager(['capabilities']);
    const names = new Set(capabilities.map(capability => capability.provider));
    const systemCapability = capabilities.find(capability => capability.provider === 'system');
    document.getElementById('system-file-hint').textContent = systemCapability?.default_package
      ? `Default package: ${systemCapability.default_package}`
      : 'Default package: unavailable; choose a custom package.';
    document.getElementById('system-card').classList.toggle('hidden', !names.has('system'));
    document.getElementById('controller-card').classList.toggle('hidden', !names.has('controller'));
    document.getElementById('module-card').classList.toggle('hidden', !names.has('module'));
    document.getElementById('providers').classList.remove('hidden');
    if (names.has('controller')) await inspectController();
    if (names.has('system')) {
      try {
        await inspectRollback();
      } catch (error) {
        document.getElementById('rollback-system').classList.add('hidden');
      }
    }
  } catch (error) {
    showError(error);
  } finally {
    document.getElementById('loading').classList.add('hidden');
  }
}

document.getElementById('refresh').addEventListener('click', loadCapabilities);
document.getElementById('system-firmware').addEventListener('change', updateSystemFileHint);
document.getElementById('update-system').addEventListener('click', () => startSystemUpdate().catch(showError));
document.getElementById('rollback-system').addEventListener('click', () => startRollback().catch(showError));
document.getElementById('cancel-task').addEventListener('click', () => cancelTask().catch(showError));
document.getElementById('reboot-device').addEventListener('click', () => rebootDevice().catch(showError));
document.getElementById('inspect-module').addEventListener('click', () => inspectModule().catch(showError));
document.getElementById('update-controller').addEventListener('click', () => startControllerUpdate().catch(showError));
document.getElementById('update-module').addEventListener('click', () => startModuleUpdate().catch(showError));
window.addEventListener('beforeunload', event => {
  if (!taskRunning) return;
  event.preventDefault();
  event.returnValue = '';
});
loadCapabilities().then(() => {
  if (activeTask) pollTask(activeTask).catch(error => {
    window.sessionStorage.removeItem('iot2050FirmwareTask');
    showError(error);
  });
});
