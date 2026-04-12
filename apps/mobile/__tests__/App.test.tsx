/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/app/AppShell', () => ({
  AppShell: () => null,
}));

test('renders correctly', async () => {
  let tree;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });

  expect(tree).toBeDefined();
});
