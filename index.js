const fastify = require('fastify')();
const cors = require('@fastify/cors');
const { spawn } = require('child_process');

// Register the CORS plugin
fastify.register(cors, {
  origin: '*', // Configure CORS options as needed
});

fastify.get('/test', async (request, reply) => {
  reply.send('Connected to the server');
});
// Utility function to execute shell commands with a timeout
function execCommand(command, args, timeout = 240000) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { shell: true });
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data;
    });

    process.stderr.on('data', (data) => {
      stderr += data;
    });

    process.on('close', (code) => {
      if (code !== 0) {
        reject({ code, stderr });
      } else {
        resolve(stdout);
      }
    });

    // Set a timeout for the process
    const timeoutId = setTimeout(() => {
      process.kill();
      reject(new Error('Process timed out'));
    }, timeout);

    // Clear timeout if process exits before timeout
    process.on('exit', () => {
      clearTimeout(timeoutId);
    });
  });
}

// Function to create Scratch Org and generate password
fastify.post('/create-scratch-org-and-generate-password', async (request, reply) => {
  const { alias } = request.body;

  if (!alias) {
    return reply.status(400).send('Alias is required');
  }

  try {
    // Authenticate Dev Hub
    await execCommand('sfdx', ['auth:web:login', '-d', '-a', 'MyDevHub'], 240000); // 2 minutes timeout

    // Create Scratch Org
    const scratchOrgOutput = await execCommand('sfdx', ['force:org:create', '-s', '-f', 'config/project-scratch-def.json', '-a', alias], 120000); // 2 minutes timeout

    // Extract username from output
    const usernameMatch = scratchOrgOutput.match(/username:\s([^\s]+)/);
    if (!usernameMatch) {
      console.error('Failed to extract username from scratch org output');
      return reply.status(500).send('Failed to create scratch org');
    }
    const scratchOrgUsername = usernameMatch[1].trim();

    // Generate Password
    const passwordOutput = await execCommand('sfdx', ['force:user:password:generate', '-u', alias, '--json'], 120000); // 2 minutes timeout
    const output = JSON.parse(passwordOutput);

    if (output.status === 0) {
      const password = output.result.password;
      reply.send({ username: scratchOrgUsername, password });
    } else {
      console.error('Failed to generate password:', output);
      reply.status(500).send('Failed to generate password');
    }
  } catch (err) {
    console.error('Error in processing request:', err);
    reply.status(500).send('Error in processing request');
  }
});

// Use the new options-based listen method with increased timeout
fastify.listen({ port: 3000, host: '0.0.0.0', connectionTimeout: 120000 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening on ${address}`);
});
