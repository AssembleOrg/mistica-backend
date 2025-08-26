# Railway MongoDB Connection Troubleshooting

## Current Issue
Your application is experiencing a "Server selection timeout: No available servers" error when trying to connect to Railway MongoDB at `nozomi.proxy.rlwy.net:23351`.

## Error Analysis
```
Server selection timeout: No available servers. Topology: { Type: Unknown, Servers: [ { Address: nozomi.proxy.rlwy.net:23351, Type: Unknown, Error: Kind: I/O error: timed out, labels: {} } ] }
```

This indicates a **network connectivity issue** between your local machine and the Railway MongoDB instance.

## Immediate Debugging Steps

### 1. Test Network Connectivity
```bash
# Test if the host is reachable
ping nozomi.proxy.rlwy.net

# Test if the port is accessible (if you have telnet)
telnet nozomi.proxy.rlwy.net 23351

# Test with curl
curl -v telnet://nozomi.proxy.rlwy.net:23351
```

### 2. Check Railway Dashboard
1. Go to [Railway Dashboard](https://railway.app/)
2. Navigate to your MongoDB service
3. Check if the service is running
4. Verify the connection string format
5. Check service logs for any errors

### 3. Test Health Endpoint
After starting your application, test:
```bash
curl http://localhost:3000/health
```

This will show you:
- Database connection status
- Current DATABASE_URL being used
- Environment information

## Common Railway MongoDB Issues

### Issue 1: Network Access Restrictions
**Problem**: Railway MongoDB might be restricted to only accept connections from Railway services
**Solution**: 
- Deploy your backend to Railway as well
- Or check if Railway allows external connections

### Issue 2: Connection String Format
**Problem**: Missing required parameters for Railway MongoDB
**Solution**: Your connection string should include:
```
mongodb://username:password@nozomi.proxy.rlwy.net:23351/database_name?retryWrites=true&w=majority&authSource=admin&connectTimeoutMS=30000&socketTimeoutMS=30000
```

### Issue 3: Authentication Credentials
**Problem**: Incorrect username/password
**Solution**:
- Verify credentials in Railway dashboard
- Ensure `authSource=admin` is included
- Check if user has proper permissions

### Issue 4: Service Dependencies
**Problem**: MongoDB service not fully started
**Solution**:
- Wait for MongoDB service to be fully running
- Check service startup logs
- Ensure proper service order

## Railway-Specific Solutions

### Solution 1: Deploy Backend to Railway
The most reliable solution is to deploy your NestJS backend to Railway:

1. **Connect your GitHub repository** to Railway
2. **Create a new service** for your backend
3. **Set environment variables** in Railway dashboard
4. **Deploy** - Railway will handle the networking automatically

### Solution 2: Check Railway MongoDB Configuration
In your Railway MongoDB service:
1. **Variables tab**: Verify `DATABASE_URL` format
2. **Settings tab**: Check if external access is enabled
3. **Logs tab**: Look for any error messages

### Solution 3: Use Railway CLI for Local Development
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link your project
railway link

# Pull environment variables
railway variables pull

# Start your app with Railway environment
railway run npm run start:dev
```

## Connection String Examples

### Basic Railway MongoDB
```
mongodb://username:password@nozomi.proxy.rlwy.net:23351/database_name
```

### With Connection Options
```
mongodb://username:password@nozomi.proxy.rlwy.net:23351/database_name?retryWrites=true&w=majority&authSource=admin&connectTimeoutMS=30000&socketTimeoutMS=30000
```

### With Replica Set (if applicable)
```
mongodb://username:password@nozomi.proxy.rlwy.net:23351/database_name?retryWrites=true&w=majority&authSource=admin&replicaSet=rs0
```

## Testing Commands

### Test MongoDB Connection
```bash
# Using MongoDB shell (if available)
mongosh "mongodb://username:password@nozomi.proxy.rlwy.net:23351/database_name?authSource=admin"

# Using Prisma Studio
npx prisma studio
```

### Test with Prisma
```bash
# Generate Prisma client
npx prisma generate

# Test database connection
npx prisma db push --preview-feature
```

## Recommended Approach

### For Development:
1. **Use Railway CLI** to pull environment variables
2. **Test locally** with Railway environment
3. **Use health endpoint** to monitor connection status

### For Production:
1. **Deploy backend to Railway**
2. **Use Railway environment variables**
3. **Let Railway handle networking**

## Next Steps

1. **Test network connectivity** to Railway MongoDB
2. **Check Railway dashboard** for service status
3. **Verify connection string** format and credentials
4. **Consider deploying backend** to Railway for better reliability
5. **Use health endpoint** to monitor connection status

## Support Resources

- [Railway Documentation](https://docs.railway.app/)
- [Railway MongoDB Setup](https://docs.railway.app/databases/mongodb)
- [Prisma MongoDB Documentation](https://www.prisma.io/docs/concepts/database-connectors/mongodb)
- [MongoDB Connection String Format](https://docs.mongodb.com/manual/reference/connection-string/)
