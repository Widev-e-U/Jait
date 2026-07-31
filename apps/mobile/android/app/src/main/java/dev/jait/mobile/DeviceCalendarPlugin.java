package dev.jait.mobile;

import android.Manifest;
import android.database.Cursor;
import android.os.Build;
import android.provider.CalendarContract;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

@CapacitorPlugin(
    name = "DeviceCalendar",
    permissions = {
        @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR })
    }
)
public class DeviceCalendarPlugin extends Plugin {
    @PluginMethod
    public void readSnapshot(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            requestPermissionForAlias("calendar", call, "calendarPermissionResult");
            return;
        }
        readCalendar(call);
    }

    @PermissionCallback
    private void calendarPermissionResult(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("Calendar permission was not granted");
            return;
        }
        readCalendar(call);
    }

    private void readCalendar(PluginCall call) {
        long now = System.currentTimeMillis();
        long defaultMin = now - 30L * 24L * 60L * 60L * 1000L;
        long defaultMax = now + 90L * 24L * 60L * 60L * 1000L;
        long timeMin = call.getLong("timeMin", defaultMin);
        long timeMax = call.getLong("timeMax", defaultMax);
        if (timeMax <= timeMin) {
            call.reject("timeMax must be after timeMin");
            return;
        }

        try {
            JSObject result = new JSObject();
            result.put("deviceId", Settings.Secure.getString(
                getContext().getContentResolver(),
                Settings.Secure.ANDROID_ID
            ));
            result.put("deviceName", Build.MANUFACTURER + " " + Build.MODEL);
            result.put("calendars", readCalendars());
            result.put("events", readEvents(timeMin, timeMax));
            call.resolve(result);
        } catch (RuntimeException error) {
            call.reject("Could not read the Android calendar provider", error);
        }
    }

    private JSArray readCalendars() {
        JSArray calendars = new JSArray();
        String[] projection = {
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.CALENDAR_COLOR,
            CalendarContract.Calendars.CALENDAR_TIME_ZONE,
            CalendarContract.Calendars.VISIBLE,
            CalendarContract.Calendars.IS_PRIMARY,
            CalendarContract.Calendars.ACCOUNT_TYPE
        };
        try (Cursor cursor = getContext().getContentResolver().query(
            CalendarContract.Calendars.CONTENT_URI,
            projection,
            null,
            null,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " ASC"
        )) {
            if (cursor == null) return calendars;
            while (cursor.moveToNext()) {
                JSObject calendar = new JSObject();
                calendar.put("id", String.valueOf(cursor.getLong(0)));
                calendar.put("name", value(cursor, 1, "Calendar"));
                calendar.put("description", value(cursor, 6, ""));
                calendar.put("color", color(cursor.getInt(2)));
                calendar.put("timeZone", value(cursor, 3, ""));
                calendar.put("selected", cursor.getInt(4) != 0);
                calendar.put("primary", cursor.getInt(5) != 0);
                calendar.put("accessRole", "reader");
                calendars.put(calendar);
            }
        }
        return calendars;
    }

    private JSArray readEvents(long timeMin, long timeMax) {
        JSArray events = new JSArray();
        String[] projection = {
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.CALENDAR_ID,
            CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.DESCRIPTION,
            CalendarContract.Instances.EVENT_LOCATION,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.STATUS,
            CalendarContract.Instances.ORGANIZER
        };
        android.net.Uri.Builder builder = CalendarContract.Instances.CONTENT_URI.buildUpon();
        android.content.ContentUris.appendId(builder, timeMin);
        android.content.ContentUris.appendId(builder, timeMax);
        try (Cursor cursor = getContext().getContentResolver().query(
            builder.build(),
            projection,
            null,
            null,
            CalendarContract.Instances.BEGIN + " ASC"
        )) {
            if (cursor == null) return events;
            while (cursor.moveToNext()) {
                long begin = cursor.getLong(6);
                long end = cursor.getLong(7);
                JSObject event = new JSObject();
                event.put("id", cursor.getLong(0) + ":" + begin);
                event.put("calendarId", String.valueOf(cursor.getLong(1)));
                event.put("calendarName", value(cursor, 2, "Calendar"));
                event.put("title", value(cursor, 3, "(Untitled event)"));
                event.put("description", value(cursor, 4, ""));
                event.put("location", value(cursor, 5, ""));
                event.put("start", isoDate(begin));
                event.put("end", isoDate(end));
                event.put("allDay", cursor.getInt(8) != 0);
                event.put("status", cursor.getInt(9) == CalendarContract.Events.STATUS_CANCELED ? "cancelled" : "confirmed");
                event.put("organizer", value(cursor, 10, ""));
                event.put("attendees", new JSArray());
                events.put(event);
            }
        }
        return events;
    }

    private static String value(Cursor cursor, int index, String fallback) {
        String value = cursor.isNull(index) ? null : cursor.getString(index);
        return value == null ? fallback : value;
    }

    private static String color(int value) {
        return String.format("#%06X", 0xFFFFFF & value);
    }

    private static String isoDate(long milliseconds) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(milliseconds));
    }
}
