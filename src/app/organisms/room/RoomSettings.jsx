import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './RoomSettings.scss';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';
import { openInviteUser } from '../../../client/action/navigation';
import * as roomActions from '../../../client/action/room';

import Text from '../../atoms/text/Text';
import Header, { TitleWrapper } from '../../atoms/header/Header';
import ScrollView from '../../atoms/scroll/ScrollView';
import Tabs from '../../atoms/tabs/Tabs';
import { MenuHeader, MenuItem } from '../../atoms/context-menu/ContextMenu';
import RoomProfile from '../../molecules/room-profile/RoomProfile';
import RoomNotification from '../../molecules/room-notification/RoomNotification';
import RoomVisibility from '../../molecules/room-visibility/RoomVisibility';

import ImagePackSettings from './settings-panels/ImagePackSettings';

import EmojiIC from '../../../../public/res/ic/outlined/emoji.svg';
import SettingsIC from '../../../../public/res/ic/outlined/settings.svg';
import SearchIC from '../../../../public/res/ic/outlined/search.svg';
import ShieldUserIC from '../../../../public/res/ic/outlined/shield-user.svg';
import LockIC from '../../../../public/res/ic/outlined/lock.svg';
import InfoIC from '../../../../public/res/ic/outlined/info.svg';
import AddUserIC from '../../../../public/res/ic/outlined/add-user.svg';
import LeaveArrowIC from '../../../../public/res/ic/outlined/leave-arrow.svg';

import { useForceUpdate } from '../../hooks/useForceUpdate';

const tabItems = [{
  iconSrc: SettingsIC,
  text: 'General',
  disabled: false,
}, {
  iconSrc: EmojiIC,
  text: 'Emoji & Stickers',
  disabled: false,
}, {
  iconSrc: SearchIC,
  text: 'Search',
  disabled: false,
}, {
  iconSrc: ShieldUserIC,
  text: 'Permissions',
  disabled: false,
}, {
  iconSrc: LockIC,
  text: 'Security',
  disabled: false,
}, {
  iconSrc: InfoIC,
  text: 'Advanced',
  disabled: false,
}];

function GeneralSettings({ roomId }) {
  const mx = initMatrix.matrixClient;
  const room = mx.getRoom(roomId);
  const canInvite = room.canInvite(mx.getUserId());

  return (
    <>
      <div className="room-settings__card">
        <MenuHeader>Notification (Changing this will only affect you)</MenuHeader>
        <RoomNotification roomId={roomId} />
      </div>
      <div className="room-settings__card">
        <MenuItem
          disabled={!canInvite}
          onClick={() => openInviteUser(roomId)}
          iconSrc={AddUserIC}
        >
          Invite
        </MenuItem>
        <MenuItem variant="danger" onClick={() => roomActions.leave(roomId)} iconSrc={LeaveArrowIC}>Leave</MenuItem>
      </div>
      <div className="room-settings__card">
        <MenuHeader>Visibility (who can join)</MenuHeader>
        <RoomVisibility roomId={roomId} />
      </div>
    </>
  );
}

GeneralSettings.propTypes = {
  roomId: PropTypes.string.isRequired,
};

function RoomSettings({ roomId }) {
  const [, forceUpdate] = useForceUpdate();
  const [selectedTab, setSelectedTab] = useState(tabItems[0]);

  const handleTabChange = (tabItem) => {
    setSelectedTab(tabItem);
  };

  useEffect(() => {
    let mounted = true;
    const settingsToggle = (isVisible) => {
      if (!mounted) return;
      if (isVisible) forceUpdate();
      else setTimeout(() => forceUpdate(), 200);
    };
    navigation.on(cons.events.navigation.ROOM_SETTINGS_TOGGLED, settingsToggle);
    return () => {
      mounted = false;
      navigation.removeListener(cons.events.navigation.ROOM_SETTINGS_TOGGLED, settingsToggle);
    };
  }, []);

  if (!navigation.isRoomSettings) return null;

  return (
    <div className="room-settings">
      <ScrollView autoHide>
        <div className="room-settings__content">
          <Header>
            <TitleWrapper>
              <Text variant="s1" weight="medium" primary>Room settings</Text>
            </TitleWrapper>
          </Header>
          <RoomProfile roomId={roomId} />
          <Tabs
            items={tabItems}
            defaultSelected={tabItems.findIndex((tab) => tab.text === selectedTab.text)}
            onSelect={handleTabChange}
          />
          <div className="room-settings__cards-wrapper">
            {selectedTab.text === tabItems[0].text && <GeneralSettings roomId={roomId} />}
            {selectedTab.text === tabItems[1].text && <ImagePackSettings roomId={roomId} />}
          </div>
        </div>
      </ScrollView>
    </div>
  );
}

RoomSettings.propTypes = {
  roomId: PropTypes.string.isRequired,
};

export default RoomSettings;
