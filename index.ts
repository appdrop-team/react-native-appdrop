
import { 
    App,
    AppConfig,
	DEFAULT_ANDROID_APP,
    DEFAULT_APP_CONFIG,
    DEFAULT_ECOMMERCE_USER,
	DEFAULT_ECOMMERCE_PROJECT,
	DEFAULT_IOS_APP,
    ECommerceProjectUser,
    Order,
    Product,
	Project,
    ProjectUser
} from 'appdrop-api';
import { getBuildNumber, getVersion } from 'react-native-device-info';
import { MainBundlePath, readFile } from 'react-native-fs';
import { Platform } from 'react-native';
import React from 'react';

/**
 * 
 * **************
 * Config
 * **************
 * 
 */

 /**
 * Returns the Appdrop config object.
 */
export async function getAppdropConfig(templateVersionId: string) {
    try {
        const build_id = getBuildNumber();
        const version_id = getVersion();
        // Fix this.
        const app_config: AppConfig = {
            build_id: build_id,
            version_id: version_id,
            api_key: '',
            app_id: '',
            app_name: '',
            project_id: '',
            platform: Platform.OS as 'ios'|'android',
            template_version_id: templateVersionId
        };
        if (Platform.OS === 'ios') {
            // Fix this.
            const config_file_str = await readFile(MainBundlePath + '/appdrop-config-ios.json', 'utf8');
            const config_file = JSON.parse(config_file_str);
            const {
                app_id,
                api_key,
                project_id,
            } = config_file;
            app_config['app_id'] = app_id;
            app_config['api_key'] = api_key;
            app_config['project_id'] = project_id;
        }
        else {
            // Fix this.
            const config_file = require('../../android/app/appdrop-config-android.json');
            const {
                app_id,
                api_key,
                project_id,
            } = config_file;
            app_config['app_id'] = app_id;
            app_config['api_key'] = api_key;
            app_config['project_id'] = project_id;
        }
        return app_config;
    }
    catch (error) {
        console.error('@react-native-appdrop getConfig threw an error',error);
        return null;
    }
}


 /**
 * 
 * **************
 * Context – Base
 * **************
 * 
 */
 
export interface AppState {
	app: App;
	local_data: {
		main: {
			app_config: AppConfig;
            current_user_id: string;
			is_app_ready: boolean;
			is_internet_connected: boolean|null;
			is_project_revoked: boolean;
		};
	};
	project: Project;
	appDispatch?: (action: AppReducerAction) => AppState | void;
}
export type AppReducerActionType = 'init'|'write';
export type WriteType = 'set'|'update';
export interface Write {
    document_path: string;
    write_type: WriteType;
}
// Create, overwrite or nullify at the provided path.
export interface Doc {
	[key:string]: string|number|boolean|string[]|Doc|null;
}
export interface SetWrite extends Write {
	doc: Doc|null;
	write_type: 'set';
}
// Update a specific field on the existing doc at the provided path.
export type FieldUpdateType = 'field_overwrite'|'field_transform';
export interface FieldUpdate {
	field_path: string[];
	field_update_type: FieldUpdateType;
}
export interface FieldOverwriteUpdate extends FieldUpdate {
	field_update_type: 'field_overwrite';
	value: string|number|boolean|string[]|null;
}
export type FieldTransformType = 'append_missing_elements'|'remove_all_from_array';
export interface FieldTransformUpdate extends FieldUpdate {
	field_transform_type: FieldTransformType;
	values: string[];
}
export interface UpdateWrite extends Write {
	updates: FieldUpdate[];
	write_type: 'update';
}
export interface AppReducerActionPayload {
    init_app_state?: AppState;
	writes?: (SetWrite|UpdateWrite)[];
}
export interface AppReducerAction {
    payload?: AppReducerActionPayload
    type: AppReducerActionType;
}
export function appReducer(
    prevState: AppState, action: AppReducerAction
): AppState {
	const {type,payload} = action;
	if (type === 'init') {
        return payload?.init_app_state as AppState;
    }
    else if (type === 'write') {
        const {writes} = payload as {writes: Write[];};
        const next_state = {} as AppState;
        Object.assign(next_state, prevState);
        for (const write of writes) {
            const [collection_id, doc_id] = write.document_path.split('/');
			const {write_type} = write;
            if (write_type === 'set') {
				const {doc} = write as SetWrite;
				// @ts-ignore
				next_state[collection_id][doc_id] = doc;
			}
            else if (write_type === 'update') {
				const {updates} = write as UpdateWrite;
				// @ts-ignore
				let affected_value = next_state[collection_id][doc_id];
				if (affected_value !== undefined && affected_value !== null) {
					for (const update of updates) {
						// @ts-ignore
						affected_value = next_state[collection_id][doc_id];
						const {field_path,field_update_type} = update;
						for (const path of [...field_path].slice(0,field_path.length-1)) {
							if (affected_value[path] === undefined) {
								throw new Error(`Improper field_path. 
								Attempt to access undefined nested field.
								collection_id: ${collection_id}, doc_id: ${doc_id}, field_path: ${field_path}`);
							}
							affected_value = affected_value[path];
						}
						const final_path = field_path[field_path.length-1];
						if (field_update_type === 'field_overwrite') {
							const {value} = update as FieldOverwriteUpdate;
							affected_value[final_path] = value;
						}
						else if (field_update_type === 'field_transform') {
							const {field_transform_type,values} = update as FieldTransformUpdate;
							if (!Array.isArray(affected_value[final_path])) {
								throw new Error(`Improper field transform operation.
								Property is not an array.
								collection_id: ${collection_id}, doc_id: ${doc_id}, field_path: ${field_path}`);
							}
							if (field_transform_type === 'append_missing_elements') {
								for (const append_value of values) {
									if (!affected_value[final_path].includes(append_value)) {
										affected_value[final_path].push(append_value);
									}
								}
							}
							else if (field_transform_type === 'remove_all_from_array') {
								for (const remove_value of values) {
									let index = affected_value[final_path].length;
									while (index--) {
										if (affected_value[final_path][index] === remove_value) {
											affected_value[final_path].splice(
												affected_value[final_path].indexOf(remove_value),1
											);
										}
									}
								}
							}
						}
					}
				}
				else {
					console.error(`BAD: Reducer is attempting to update a doc that is null or undefined.
					collection_id: ${collection_id}, doc_id: ${doc_id}`);
				}
            }
        }
        return next_state;
    }
	else {
		throw new Error('incorrect action type passed to reducer. action:' + JSON.stringify(action));
	}
}
 
 /**
 * 
 * **************
 * Context – ECommerce
 * **************
 * 
 */

 
export interface ECommerceAppState extends AppState {
	local_data: {
		main: {
			app_config: AppConfig;
			current_user_id: string;
			is_app_ready: boolean;
			is_internet_connected: boolean|null;
			is_project_revoked: boolean;
		};
	};
    orders: {
        [key: string]: Order;
    };
	products: {
		[key: string]: Product;
	};
	users: {
		[key: string]: ECommerceProjectUser;
	}
}
export const InitialECommerceAppState: ECommerceAppState = {
	app: Platform.OS === 'ios' ? DEFAULT_IOS_APP : DEFAULT_ANDROID_APP,
	local_data: {
		main: {
			app_config: DEFAULT_APP_CONFIG,
			current_user_id: '',
			is_app_ready: false,
			is_internet_connected: false,
			is_project_revoked: false,
		},
	},
    orders: {},
    products: {},
	project: DEFAULT_ECOMMERCE_PROJECT,
	users: {},
    appDispatch: (): void => {
        throw new Error('appDispatch must be set.');
    }
};
export const ECommerceAppContext = React.createContext<ECommerceAppState>(InitialECommerceAppState);