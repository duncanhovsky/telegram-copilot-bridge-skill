param(
  [ValidateSet('build','start','test')]
  [string]$Action = 'build'
)

switch ($Action) {
  'build' {
    npm install
    npm run build
  }
  'start' {
    npm run start
  }
  'test' {
    npm run test
  }
}
