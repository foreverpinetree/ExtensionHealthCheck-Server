if [ $1 ]; then
  #statements
  # NODE_ENV=production PORT=9001 pm2 start bin/www -i 0 -n ExtensionHealthCheck-Server
  NODE_ENV=production PORT=9001 pm2 start bin/www -n ExtensionHealthCheck-Server:9001
  exit
fi
echo 'http://localhost:9001 ExtensionHealthCheck-Server' 
sudo PORT=9001 NODE_ENV=localhost nodemon bin/www
# sudo PORT=9001 NODE_ENV=production nodemon bin/www