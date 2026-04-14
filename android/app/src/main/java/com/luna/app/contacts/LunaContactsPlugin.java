package com.luna.app.contacts;

import android.Manifest;
import android.database.Cursor;
import android.provider.ContactsContract;

import androidx.annotation.NonNull;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.LinkedHashMap;
import java.util.Map;

@CapacitorPlugin(
    name = "Contacts",
    permissions = {
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS })
    }
)
public class LunaContactsPlugin extends Plugin {
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("contacts", "granted");
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("contacts", call, "contactsPermissionCallback");
    }

    @PermissionCallback
    private void contactsPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("contacts", getPermissionState("contacts") == PermissionState.GRANTED ? "granted" : "denied");
        call.resolve(result);
    }

    @PluginMethod
    public void getContacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            call.reject("연락처 권한이 필요해요.");
            return;
        }

        JSObject result = new JSObject();
        result.put("contacts", queryContacts());
        call.resolve(result);
    }

    private JSArray queryContacts() {
        JSArray contacts = new JSArray();
        Map<Long, ContactEntry> byId = new LinkedHashMap<>();

        String[] projection = new String[] {
            ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        };

        try (Cursor cursor = getContext().getContentResolver().query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            projection,
            null,
            null,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
        )) {
            if (cursor == null) {
                return contacts;
            }

            int idColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
            int nameColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
            int phoneColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);

            while (cursor.moveToNext()) {
                long contactId = cursor.getLong(idColumn);
                String displayName = cursor.getString(nameColumn);
                String phoneNumber = cursor.getString(phoneColumn);

                if (displayName == null || displayName.trim().isEmpty() || phoneNumber == null || phoneNumber.trim().isEmpty()) {
                    continue;
                }

                ContactEntry entry = byId.get(contactId);
                if (entry == null) {
                    entry = new ContactEntry(displayName.trim());
                    byId.put(contactId, entry);
                }

                entry.addPhone(phoneNumber.trim());
            }
        }

        for (ContactEntry entry : byId.values()) {
            contacts.put(entry.toJson());
        }

        return contacts;
    }

    private static class ContactEntry {
        private final String displayName;
        private final LinkedHashMap<String, Boolean> phones = new LinkedHashMap<>();

        ContactEntry(@NonNull String displayName) {
            this.displayName = displayName;
        }

        void addPhone(@NonNull String phoneNumber) {
            phones.put(phoneNumber, Boolean.TRUE);
        }

        JSObject toJson() {
            JSObject contact = new JSObject();
            JSObject name = new JSObject();
            name.put("display", displayName);
            contact.put("name", name);

            JSArray phoneArray = new JSArray();
            for (String phoneNumber : phones.keySet()) {
                JSObject phone = new JSObject();
                phone.put("number", phoneNumber);
                phoneArray.put(phone);
            }
            contact.put("phones", phoneArray);

            return contact;
        }
    }
}