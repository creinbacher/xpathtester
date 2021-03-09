# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2021-03-09

### Added

- Added settings so you can change the look of the extension
- OutputChannel is now activated once you click 'check'

### Changed

- Improved readme
- Fixed wrong releasedate for version 1.1.0 in changelog

## [1.1.0] - 2021-02-28

### Added

- Information about the processed query, results and duration are now logged in a seperate OutputChannel called 'XPath'
- Functions like count() or sum() are now supported
- More input validation to prevent errors while executing the query

### Changed

- Only highlights selected nodes and not their children
- Namespaces should no longer lead to wrong decorations
- Moved decoration to its own class to improve readability
- Decorations are now added based on the line information from xpath evaluate

### Removed

- Duplicate decorations
- Extension is no longer in Preview state

## [1.0.0] - 2021-02-12

### Added

- Preview Release of XPathTester
